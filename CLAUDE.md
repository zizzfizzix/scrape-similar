# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Scrape Similar is a cross-browser (Chromium / Firefox / Edge) Manifest V3 web extension built with **WXT** + Vite + React 19 + TypeScript + Tailwind 4 + shadcn-ui. It extracts structured data from web pages via XPath selectors, with a visual point-and-click element picker, and exports to Google Sheets, .xlsx, CSV, TSV, or the clipboard.

Package manager: **pnpm** (Node >= 22). Do not use npm/yarn for installs.

## Commands

```bash
cp .env.example .env    # one-time: local env config the unit tests need (see below)
pnpm install            # install deps; postinstall runs `wxt prepare`
pnpm dev                # WXT dev server (auto-reloads). Targets Chromium by default.
pnpm dev:firefox        # dev server targeting Firefox
pnpm build              # production build (Chromium) -> .output/
pnpm build:test         # production build with NODE_ENV=test (used by E2E)
pnpm build:firefox      # Firefox build (also produces sources.zip required by AMO)
pnpm zip                # zip the build for store submission
pnpm zip:firefox        # Firefox-specific zip + sources

pnpm compile            # TypeScript type-check only (tsc --noEmit)
pnpm lint               # ESLint, warnings included (CI gate + pre-commit)
pnpm lint:fix           # ESLint with the fixes it can make itself
pnpm fmt                # Prettier write
pnpm fmt-check          # Prettier check (CI gate + pre-commit)

pnpm test               # Vitest unit tests (jsdom). Single file: pnpm test path/to/file.test.ts
pnpm test:coverage      # Unit tests + v8 coverage; fails below the thresholds (what CI runs)
pnpm test:e2e           # Playwright E2E. Requires `pnpm build:test` first to produce .output/

pnpm update:shadcn      # rerun bash scripts/update-shadcn.sh to refresh shadcn-ui components
```

Lefthook hooks (`lefthook.yml`) split the checks by what they are a property of: `pre-commit` runs `pnpm fmt-check` and `pnpm lint` in parallel (both are properties of the diff, and both only read), and `pre-push` runs `pnpm test:coverage` (a ~40s run, and coverage describes the branch rather than each work-in-progress commit). Hooks are installed by the `prepare` script (`scripts/install-git-hooks.mjs`) on `pnpm install` — pnpm's warning that lefthook's own build script was ignored is harmless, since that script only does the same `lefthook install`. A `post-checkout` hook (`.lefthook/post-checkout/worktree-setup.sh`) bootstraps newly created worktrees (copies `.env` / `.env.test` from the origin checkout, runs `pnpm install`).

**`typescript` in `node_modules` is not TypeScript 7.** TS 7 ships no JS compiler API, so `typescript` is aliased to `@typescript/typescript6` for typescript-eslint and `prettier-plugin-organize-imports`, and TS 7 is installed as `typescript7` — it still owns the `tsc` binary, so `pnpm compile` is unchanged. See the README for the table and for when the alias comes out. Two consequences worth knowing: `import ts from 'typescript'` gets the 6.0 API, and `prettier-plugin-organize-imports` only works because of the alias (against TS 7 it silently does nothing).

**Copy `.env.example` to `.env` before running the test suite locally.** The PostHog tests read `VITE_PUBLIC_POSTHOG_KEY` / `VITE_PUBLIC_POSTHOG_HOST` and fail without them; any non-empty placeholder values work for the unit tests (the ones shipped in `.env.example` are fine), and real project values are only needed to exercise actual analytics. CI supplies these as repository secrets, so the failures show up only on a fresh local clone.

**Never commit `.env`.** It is gitignored and must stay that way — only `.env.example` is tracked.

The Cursor rule (`.cursor/rules/browser-extension.mdc`) instructs **never to run `pnpm dev`** in agent contexts — use `pnpm build` (or `pnpm compile`) to verify changes instead.

## Architecture

### Entry points (WXT auto-discovers `src/entrypoints/*`)

- `background/` — MV3 service worker. Entry is `index.ts` which only wires up listeners + services. Logic lives in:
  - `handlers/` — message routing (`messages.ts` is the central router that splits content-script vs extension-page messages), Sheets export, content-script + UI handlers.
  - `listeners/` — `browser.*` event subscriptions (action click, commands, context menu, install/startup, tab updates).
  - `services/` — long-lived state: `analytics-queue` (PostHog event queue with consent gating), `debug-mode`, `demo-scrape`, `session-storage` (per-tab `SidePanelConfig`).
  - `utils/` — `auth.ts` (Google OAuth via `browser.identity`), `content-injection.ts`, `context-menu-setup.ts`.
- `content/` — content script injected into all http(s) pages. `handlers.ts` dispatches messages; `picker/` implements the visual element picker; `highlight.ts` paints matches; `state.ts` holds per-tab state including `lastRightClickedElement`.
- `sidepanel/`, `options/`, `onboarding/`, `full-data-view/` — React UIs. Each has `index.html` + `main.tsx` + an App component.

**Two WXT rules constrain how these files are written.** Neither shows up in `tsc` or the unit suite — both only fail `pnpm build`, so verify an entrypoint change with a build, not just tests.

- **Nothing but an entrypoint goes directly in `src/entrypoints/`.** Every file at that level is auto-discovered as an entrypoint and must default-export one, so a shared helper placed there fails the build with `requireDefaultExport`. Put it in a subdirectory beside the entrypoint that uses it (`content/bootstrap.ts`, `background/bootstrap.ts`) or under `src/components/` when several entrypoints share it (`components/extension-page.tsx`).
- **Call into the bootstrap module from inside `main`; never pass it by reference.** `defineBackground(() => { startBackground() })` and `defineContentScript({ main(ctx) { startContentScript(ctx) } })` are the shapes that work. WXT imports each entrypoint once to read its config and strips the `main` body for that pass, which drops the now-unused import with it. `defineBackground(startBackground)` keeps the identifier alive, so the whole module graph evaluates during a pass that has no auto-imports injected — and fails on the first auto-imported symbol used at module scope (`MESSAGE_TYPES` in `background/handlers/content-script.ts`).

### Cross-context communication

All cross-context calls go through `browser.runtime.sendMessage` / `browser.tabs.sendMessage`. Message types are defined as a single `as const` object in `src/utils/types.ts` (`MESSAGE_TYPES`) and grouped by direction (sidepanel→content, content→background, etc.). Always reference these constants — do not pass raw strings. `Message<T>` and `MessageResponse` are the canonical envelope/response types.

`Message`'s payload defaults to `unknown`, so a handler has to say what it expects before it can read one — a cast at the top of the handler (`message.payload as ScrapeConfig`) or, where the payload arrives from outside, a validator (`validateExportPayload`). Every reply goes through `MessageResponse`, on both sides: the content script's `sendResponse` is typed the same as the background's, so a new reply shape is a member of that union rather than a widening of one callback.

The background's `setupMessageListener` (`background/handlers/messages.ts`) handles `UPDATE_SIDEPANEL_DATA` itself, then routes by sender: messages with `sender.tab` and a non-extension URL go to `handleContentScriptMessage`; everything else goes to `handleUiMessage`.

### Storage

Use **WXT storage** (`storage.defineItem`, `storage.getItem`, `storage.setItem`) — never `chrome.storage.*` directly. Storage areas are encoded in the key prefix:

- `sync:user_presets` — synced preset list (versioned via `USER_PRESETS_VERSION` + `PRESET_MIGRATIONS` in `src/utils/storage.ts`). When changing the preset shape, bump `USER_PRESETS_VERSION` and add a migration.
- `local:event_queue` — analytics queue (see below).
- `session:` — per-tab transient `SidePanelConfig`.

System (built-in) presets live in `src/utils/system_presets.ts`; their enabled/disabled state is tracked separately under `SYSTEM_PRESET_STATUS_KEY`. Use `isSystemPreset` to distinguish from user presets.

### Path aliases

`@/*` → `src/*`, `@@/*` → repo root (e.g. `import pkg from '@@/package.json'`). Defined in both `tsconfig.json` and `wxt.config.ts` (FIXME: required workaround for shadcn — see config comment).

### Logging

Use **`loglevel`** (`import log from 'loglevel'`), never `console.*`. Each entrypoint sets a default level of `error` and switches to `trace` when debug mode is on or when `isDevOrTest` (`src/utils/modeTest.ts`). Content scripts request the current debug-mode flag from the background on init and listen for `DEBUG_MODE_CHANGED` broadcasts.

### Analytics (PostHog)

Events are queued via `queueEvent` (mutex-guarded, capped at `MAX_QUEUED_EVENTS = 1000`, FIFO drop) into `local:event_queue`. Event properties are `AnalyticsProperties` (`src/utils/types.ts`) — JSON values plus `undefined` — everywhere they appear: `trackEvent`'s argument, `QueuedEvent.props` and `TrackEventPayload.properties`. A property PostHog could not serialise is a type error rather than a field that quietly arrives as `null`. The background `analytics-queue` service flushes to PostHog only after the user grants consent (consent state is also storage-driven). `VITE_PUBLIC_POSTHOG_KEY` / `VITE_PUBLIC_POSTHOG_HOST` come from `.env` — see `.env.example`. Never hallucinate API keys; read them from `.env`. See [Commands](#commands) for the local `.env` setup the unit tests require and the rule against committing it.

PostHog naming rules:

- **Event names, property names, and feature-flag names referenced in 2+ places must be centralized** as an `as const` object (see `MESSAGE_TYPES` in `src/utils/types.ts` for the pattern) — never scatter raw string literals. Members are `UPPERCASE_WITH_UNDERSCORE`.
- Use **as few callsites per feature flag as possible**; if the same flag must be checked in multiple places, surface it for review rather than copy-pasting.
- Gate flag-dependent code on a check that the flag's value is valid and expected.
- Before introducing new event/property names, check existing usage and conventions across the project — renaming or reusing inconsistently breaks reporting.

### CSP / permissions

Manifest is generated dynamically by `wxt.config.ts`. CSP allowlists PostHog and Google API domains; in dev mode it also allows `ws://localhost:*` for Vite HMR. Permissions are kept minimal: `contextMenus`, `identity` (OAuth), `scripting`, `storage`, `tabs` plus `host_permissions: http://*/*, https://*/*`. The `oauth2.client_id` and extension `key` are committed in `wxt.config.ts` — do not change without coordinating with the Chrome Web Store listing.

## Testing

- **Unit tests**: Vitest with jsdom (`vitest.config.ts`, `vitest.setup.ts` patches `TextEncoder` for jsdom). Tests live in `__tests__/` directories next to the code (`src/utils/__tests__`, `src/components/__tests__`, `src/entrypoints/content/__tests__`, `src/entrypoints/background/listeners/__tests__`). `WxtVitest()` plugin provides `browser.*` and `storage.*` mocks. Tests under `tests/e2e/**` are excluded from the unit run.
- **Missing `.env` is not a regression**: without a local `.env`, `pnpm test` fails exactly 6 tests — 4 in `src/utils/__tests__/posthog-debug.test.ts` and 2 in `src/utils/__tests__/distinct_id.test.tsx`. That signature means missing local env config, so the fix is `cp .env.example .env` — never `--no-verify` to bypass the hooks, and never committing the `.env` you just created.
- **Coverage is a ratcheting quality gate**: `vitest.config.ts` sets `coverage.thresholds` to the suite's current floor, which is now **100/100/100/100** across statements, branches, functions and lines ([#266](https://github.com/zizzfizzix/scrape-similar/issues/266) closed the last gaps), so `pnpm test:coverage` exits non-zero if a change lowers coverage. Never lower them to make a change pass — new code arrives with its tests, or with the reason a branch cannot be reached and is therefore deleted. The `Unit Tests` workflow runs it on every PR, renders the numbers onto the check page via `scripts/coverage-summary.mjs` (biggest gaps first — that table is the ratchet's worklist), and uploads the HTML report as the `coverage-report` artifact. Excluded from measurement: generated `src/components/ui/**`, type-only modules, and the entrypoint bootstrap files (`src/entrypoints/*/main.tsx`, `background/index.ts`, `content/index.ts`) — these hold `createRoot().render()` / WXT `define*` wiring only, and the E2E suite exercises them.
- **The exclusion list is itself gated.** It lives in `coverage-exclusions.ts` (imported by both `vitest.config.ts` and `eslint.config.ts`) with the reason for each group, and `src/__tests__/coverage-exclusions.test.ts` asserts: the list matches an explicit literal, so widening it means editing the test in the same diff; every path still exists; and every type-only entry really exports no runtime value. `BOOTSTRAP_LINE_BUDGET` is applied as `max-lines` over the bootstrap files in the lint config. The list shrinks the measured total, so do not add to it to make a check pass.
- **The measured total is gated too.** A percentage gate only checks a ratio, so code that disappears from instrumentation makes it greener rather than redder — which is how the project reported 100% while measuring a quarter of itself ([#268](https://github.com/zizzfizzix/scrape-similar/issues/268)). `scripts/check-coverage-fidelity.mjs`, chained onto `pnpm test:coverage`, fails the run when the auto-import transform stops emitting column-level sourcemaps or when measured statements collapse against the volume of source. The cause of #268 is held off by a one-line `pnpm` patch on `unimport` (`patchedDependencies` in `pnpm-workspace.yaml`); drop the patch once [unjs/unimport#562](https://github.com/unjs/unimport/issues/562) or [wxt-dev/wxt#2604](https://github.com/wxt-dev/wxt/issues/2604) ships. The patch is pinned to an exact version, so a bare `unimport` upgrade fails the install instead of silently re-collapsing coverage.
- **Never `await` on one side of a branch in an expression.** V8 counts the code after an `await` as part of the block that resumed it, so an `await` on the right of `||`, `&&` or `??`, or in an arm of `?:`, makes _every statement after it in the same function_ inherit that branch's count instead of the function's — code that ran on all paths reports the count of the one path that awaited, and where the `await` never runs at all it reports as dead. That is [#272](https://github.com/zizzfizzix/scrape-similar/issues/272), which read as a branch nobody could cover and was worked around with an `else` written for the tooling rather than the code. Await on its own line and use the result in the expression; a branch that is a statement (`if`, a loop body) is fine, because V8 gives it a block of its own. The lint rule `coverage/no-conditional-await` (`tools/eslint-rules/no-conditional-await.ts`) enforces this over the measured set and carries the arithmetic in its doc comment.
- **Keep new logic out of the bootstrap files**, or it becomes untestable and silently unmeasured: put it in a module beside them and cover it there. The existing examples are `content/bootstrap.ts`, `background/bootstrap.ts` (what the service worker starts), `sidepanel/SidePanelRoot.tsx` and `components/extension-page.tsx` (finding a page's root element and the provider stack the pages share). What is left in each `main.tsx` / `index.ts` is 10-17 lines of `define*` wrapper, log level and provider nesting, and `BOOTSTRAP_LINE_BUDGET` holds them there.
- **Don't write a test purely to colour in an unreachable branch.** Several defensive branches are artefacts of `noUncheckedIndexedAccess` and cannot be hit; delete the dead code (a `!` with a comment saying why it is safe) rather than faking coverage of it. The same goes for a `catch` around helpers that already report their own failures in a return value, and for a `?? fallback` behind a guard that makes the value non-nullish — #266 removed a lot of both, each with the reason in a comment.
- **Unit-test harness**: **`@testing-library/react`**, with `user-event` for interactions and `jest-dom`'s matchers (registered for every file in `vitest.setup.ts`). The hand-rolled `tests/support/react.tsx` it replaced is gone; nothing should reintroduce a local `render`. Four things the migration in #266 had to settle, all of which will come up again:
  - **`render` is synchronous.** The old harness awaited `act`, so a component that reads storage on mount had settled by the first assertion. Prefer `await screen.findBy*` / `await waitFor(...)`; where a whole file asserts against a mount-time read, its local `render` helper does `await act(async () => {})` once and returns the result.
  - **Never nest `act` around `user-event`.** It already wraps its own dispatches; `act(() => userEvent.click(x))` returns a promise from a sync callback and deadlocks the test.
  - **`user-event` and `vi.useFakeTimers()` fight.** It waits between events and nothing advances the clock. Either hand it one (`userEvent.setup({ advanceTimers })`) or, where that is still not enough, drive Radix with `fireEvent` pointer events — `ExportButtons.component.test.tsx` does the latter and says why.
  - **Radix locks `pointer-events` on the body** while a drawer or dialog is open, and `user-event` honours that and refuses the click. Use `fireEvent.click` for anything inside an open overlay.
- **jsdom shims** live in `vitest.setup.ts` (`matchMedia`, `PointerEvent`, pointer capture, `scrollIntoView`, `scrollTo`, `ResizeObserver`) — everything Radix and the layout-measuring components reach for. `tests/support/dom.ts` holds the one shim a test has to opt into with a value of its own, `stubOffsetWidth`.
- **E2E tests**: Playwright (`playwright.config.ts`, `tests/e2e/`). Tests load the test build (`pnpm build:test` first) as an unpacked extension and drive the service worker + extension pages. Use the `TestHelpers` and fixtures in `tests/e2e/fixtures.ts`. `chromeExtensionId` is read from `package.json`. CI uses 4 workers, matching the runner's vCPUs; the suite does not scale past that (each test launches its own browser, and wall-clock measured flat from 2 to 20 workers), so `fullyParallel` stays off. Reporting stays on the built-in `github` reporter, which annotates every failed attempt including retried-and-passed ones - flaky tests are meant to be visible, not filtered out.
- **E2E scrape targets are local.** Pages under `tests/e2e/fixtures/pages/` are served per worker from an ephemeral-port HTTP server (content scripts only run on http(s) URLs, so they cannot be loaded from disk). Resolve one with the `fixturePageUrl` fixture — e.g. `fixturePageUrl(SCRAPE_TARGET_PAGE)` — and assert against the exact counts in `FIXTURE_PAGE_COUNTS` rather than a `/^\d+$/` wildcard. When editing a fixture page, update those counts in the same commit. The onboarding demo specs are the one exception to the `fixturePageUrl` route: the demo URL is baked into the extension, so they serve a local fixture at that URL through `TestHelpers.mockDemoTargetPage` instead (see the note at the top of `tests/e2e/onboarding.spec.ts`). The whole suite runs offline.

## Linting

`eslint.config.ts` is where the conventions below stop being review comments. Five things about it:

- **It is type-aware but sparing with typed rules.** `projectService` is on, so a typed rule is a one-line addition. What is enabled is the syntactic sets (`@eslint/js`, `typescript-eslint` recommended, `react-hooks`, `vitest`, `testing-library`, `jest-dom`) plus the typed rules the codebase already satisfies (`ALREADY_CLEAN`, and the boolean-naming rule below); the rest is staged in `DEFERRED`.
- **`naming-convention` is on for one row of the conventions, not all of them.** Booleans only (#284), on the `variable` selector, and it strips `null | undefined` before checking a type (`getNonNullableType()`) so it cannot tell a tri-state from a boolean. Both of those, and what each row or wider selector would report if you turned it on, are recorded beside the rule with the counts to check them against.
- **`DEFERRED` is the worklist, not a dumping ground.** Each rule in it is off with the number of violations it reports and why they are not a diff away — `no-floating-promises` (128, of which 65 are `trackEvent`), `no-misused-promises` (35), `testing-library/no-node-access` (265). Re-enabling one means fixing what it names; the counts are there to be checked, so update them if they move. Never add a rule to `DEFERRED` to make a check pass without recording the same two things. The four React Compiler rules that wanted effects restructured came out in [#279](https://github.com/zizzfizzix/scrape-similar/issues/279), so the whole `react-hooks` set is on: an effect that mirrors a prop or an external source into state is a lint error now, not a review comment. `no-explicit-any` came out in [#278](https://github.com/zizzfizzix/scrape-similar/issues/278), which leaves nothing in `typescript-eslint`'s recommended set overridden — a new `any` is a lint error wherever it appears, test scaffolding included.
- **Two `jest-dom` rules are off on their merits rather than deferred**: `prefer-to-have-text-content` and `prefer-to-have-style` rewrite exact assertions into weaker ones (substring matching; no way to say a declaration is unset), and both fixers mangle `expect((el as HTMLElement).…)` into unparseable code.
- **The escape hatch is `eslint-disable-next-line <rule> -- <reason>`**, and the reason is the point. Where a rule is right about the shape but wrong about this code, prefer restructuring the code — `src/utils/__tests__/validatePresets.test.ts` grew two narrowing helpers rather than disabling `vitest/no-conditional-expect` over its `if ('error' in result)` blocks.

Local rules live in `tools/eslint-rules/`, outside `src/` so they are not measured by the coverage gate, with their own tests beside them (`RuleTester` under vitest).

## UI components

shadcn-ui components in `src/components/ui/` are generated/managed; custom components live in `src/components/custom/` (the `update-shadcn.sh` script auto-segregates them and rewrites imports). Edits to `ui/` files may be overwritten by `pnpm update:shadcn` — put bespoke logic in `custom/` or in the parent component. Theming uses `next-themes` and CSS variables (light/dark), with Tailwind 4 via `@tailwindcss/vite`.

## Code conventions

- **Only write a comment that says something the code cannot.** A comment earns its place by explaining _why_ — a constraint that is not visible locally, a reason an obvious-looking alternative is wrong, a decision someone would otherwise undo. Delete anything that restates the line below it: `// Set default log level` above `log.setDefaultLevel('error')`, `// Initialize debug mode` above `initializeDebugMode()`, a JSDoc line that repeats the function's own name. Those are noise that goes stale silently, and they train readers to skim past the comments that matter. This applies to comments you are moving or copying as much as to new ones — do not carry a redundant comment across during a refactor.
  - Worth keeping, as examples from this repo: why a `catch` was deleted rather than tested (the callee already reports failure in its return value); why `defineBackground` is called with a body rather than a reference (WXT strips the body when it reads the config); why a test drives Radix with `fireEvent` rather than `user-event` (fake timers); why a `!` is safe (the router refuses a sender without a tab id before any handler runs).
  - The same test applies to a name: if a comment is needed to explain _what_ something does, prefer renaming it.
- **TypeScript everywhere**, functional components + hooks; no classes. Prefer `interface` over `type` for object shapes that may be extended. Avoid `enum` — use a const object with `as const` plus a derived union type (the `MESSAGE_TYPES` pattern).
- **Named exports** for components and functions (no default exports for components). Enforced by `no-restricted-syntax`; the only exemptions are the files a tool reads a default export from — `src/entrypoints/*/index.ts` for WXT and the root `*.config.ts` files for Vite.
- **A boolean variable reads as a question**: `is`, `has`, `should`, `can`, `was` or `will`, enforced by `@typescript-eslint/naming-convention` (#284). It covers the `variable` selector only, so a prop or a message-payload field keeps the name its contract gives it and a passthrough reads `showEmptyRows={shouldShowEmptyRows}` — the prop says what the component does with it, the variable says what it holds. A variable holding a `ConsentState` is named `…consentState` and exempt, because that type is `boolean | undefined` where `undefined` means "not asked yet" and a prefix would promise two states where there are three.
- Directories: lowercase-with-dashes. Functions/variables: camelCase. Message-type / event-name constants: `UPPERCASE_WITH_UNDERSCORE`.
- Define explicit interfaces for every cross-context message payload — see existing types in `src/utils/types.ts`.
- **Always use `browser.*` (auto-imported by WXT) and the `Browser.*` namespace for types — never `chrome.*`.** WXT's typed `browser` works cross-browser (Chromium, Firefox, Edge) and `Browser.tabs.Tab`, `Browser.sidePanel.OpenOptions`, `Browser.runtime.InstalledDetails`, etc. are the canonical types. `chrome.*` globals are not part of the typing setup and produce IDE errors. If you must touch a callback-style API, handle `browser.runtime.lastError`.
- Never use `eval()` or assign to `innerHTML` in content scripts.

## Git

- Do not stage changes (`git add`) unless explicitly asked.
- Do not commit unless explicitly asked. The lefthook `pre-commit` hook runs `pnpm fmt-check` and the `pre-push` hook runs `pnpm test:coverage`; if asked to commit or push, they must pass — fix failures rather than bypassing the hook.

## Release flow

Releases are managed by **release-please** (`.github/workflows/release-please.yml`). PRs from branches starting with `release-please--` are auto-skipped by the unit-test and E2E workflows. Conventional Commits drive the changelog. Don't manually edit `CHANGELOG.md` or bump `package.json` version — let release-please do it.
