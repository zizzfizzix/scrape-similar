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
pnpm fmt                # Prettier write
pnpm fmt-check          # Prettier check (CI gate + pre-commit)

pnpm test               # Vitest unit tests (jsdom). Single file: pnpm test path/to/file.test.ts
pnpm test:e2e           # Playwright E2E. Requires `pnpm build:test` first to produce .output/

pnpm update:shadcn      # rerun bash scripts/update-shadcn.sh to refresh shadcn-ui components
```

A lefthook `pre-commit` hook (`lefthook.yml`) runs `pnpm fmt-check` and `pnpm test`; both must pass to commit. Hooks are installed by the `prepare` script (`scripts/install-git-hooks.mjs`) on `pnpm install` — pnpm's warning that lefthook's own build script was ignored is harmless, since that script only does the same `lefthook install`. A `post-checkout` hook (`.lefthook/post-checkout/worktree-setup.sh`) bootstraps newly created worktrees (copies `.env` / `.env.test` from the origin checkout, runs `pnpm install`).

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

### Cross-context communication

All cross-context calls go through `browser.runtime.sendMessage` / `browser.tabs.sendMessage`. Message types are defined as a single `as const` object in `src/utils/types.ts` (`MESSAGE_TYPES`) and grouped by direction (sidepanel→content, content→background, etc.). Always reference these constants — do not pass raw strings. `Message<T>` and `MessageResponse` are the canonical envelope/response types.

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

Events are queued via `queueEvent` (mutex-guarded, capped at `MAX_QUEUED_EVENTS = 1000`, FIFO drop) into `local:event_queue`. The background `analytics-queue` service flushes to PostHog only after the user grants consent (consent state is also storage-driven). `VITE_PUBLIC_POSTHOG_KEY` / `VITE_PUBLIC_POSTHOG_HOST` come from `.env` — see `.env.example`. Never hallucinate API keys; read them from `.env`. See [Commands](#commands) for the local `.env` setup the unit tests require and the rule against committing it.

PostHog naming rules:

- **Event names, property names, and feature-flag names referenced in 2+ places must be centralized** as an `as const` object (see `MESSAGE_TYPES` in `src/utils/types.ts` for the pattern) — never scatter raw string literals. Members are `UPPERCASE_WITH_UNDERSCORE`.
- Use **as few callsites per feature flag as possible**; if the same flag must be checked in multiple places, surface it for review rather than copy-pasting.
- Gate flag-dependent code on a check that the flag's value is valid and expected.
- Before introducing new event/property names, check existing usage and conventions across the project — renaming or reusing inconsistently breaks reporting.

### CSP / permissions

Manifest is generated dynamically by `wxt.config.ts`. CSP allowlists PostHog and Google API domains; in dev mode it also allows `ws://localhost:*` for Vite HMR. Permissions are kept minimal: `contextMenus`, `identity` (OAuth), `scripting`, `storage`, `tabs` plus `host_permissions: http://*/*, https://*/*`. The `oauth2.client_id` and extension `key` are committed in `wxt.config.ts` — do not change without coordinating with the Chrome Web Store listing.

## Testing

- **Unit tests**: Vitest with jsdom (`vitest.config.ts`, `vitest.setup.ts` patches `TextEncoder` for jsdom). Tests live in `__tests__/` directories next to the code (`src/utils/__tests__`, `src/components/__tests__`, `src/entrypoints/content/__tests__`, `src/entrypoints/background/listeners/__tests__`). `WxtVitest()` plugin provides `browser.*` and `storage.*` mocks. Tests under `tests/e2e/**` are excluded from the unit run.
- **Missing `.env` is not a regression**: without a local `.env`, `pnpm test` fails exactly 6 tests — 4 in `src/utils/__tests__/posthog-debug.test.ts` and 2 in `src/utils/__tests__/distinct_id.test.tsx`. That signature means missing local env config, so the fix is `cp .env.example .env` — never `--no-verify` to bypass the pre-commit hook, and never committing the `.env` you just created.
- **E2E tests**: Playwright (`playwright.config.ts`, `tests/e2e/`). Tests load the test build (`pnpm build:test` first) as an unpacked extension and drive the service worker + extension pages. Use the `TestHelpers` and fixtures in `tests/e2e/fixtures.ts`. `chromeExtensionId` is read from `package.json`. CI uses 20 workers and the `github` reporter (`playwright.config.ts:11`).

## UI components

shadcn-ui components in `src/components/ui/` are generated/managed; custom components live in `src/components/custom/` (the `update-shadcn.sh` script auto-segregates them and rewrites imports). Edits to `ui/` files may be overwritten by `pnpm update:shadcn` — put bespoke logic in `custom/` or in the parent component. Theming uses `next-themes` and CSS variables (light/dark), with Tailwind 4 via `@tailwindcss/vite`.

## Code conventions

- **TypeScript everywhere**, functional components + hooks; no classes. Prefer `interface` over `type` for object shapes that may be extended. Avoid `enum` — use a const object with `as const` plus a derived union type (the `MESSAGE_TYPES` pattern).
- **Named exports** for components and functions (no default exports for components).
- Variable naming: use auxiliary verbs for booleans (`isX`, `hasX`, `shouldX`).
- Directories: lowercase-with-dashes. Functions/variables: camelCase. Message-type / event-name constants: `UPPERCASE_WITH_UNDERSCORE`.
- Define explicit interfaces for every cross-context message payload — see existing types in `src/utils/types.ts`.
- **Always use `browser.*` (auto-imported by WXT) and the `Browser.*` namespace for types — never `chrome.*`.** WXT's typed `browser` works cross-browser (Chromium, Firefox, Edge) and `Browser.tabs.Tab`, `Browser.sidePanel.OpenOptions`, `Browser.runtime.InstalledDetails`, etc. are the canonical types. `chrome.*` globals are not part of the typing setup and produce IDE errors. If you must touch a callback-style API, handle `browser.runtime.lastError`.
- Never use `eval()` or assign to `innerHTML` in content scripts.

## Git

- Do not stage changes (`git add`) unless explicitly asked.
- Do not commit unless explicitly asked. The lefthook `pre-commit` hook runs `pnpm fmt-check` and `pnpm test`; if asked to commit, both must pass — fix failures rather than bypassing the hook.

## Release flow

Releases are managed by **release-please** (`.github/workflows/release-please.yml`). PRs from branches starting with `release-please--` are auto-skipped by the unit-test and E2E workflows. Conventional Commits drive the changelog. Don't manually edit `CHANGELOG.md` or bump `package.json` version — let release-please do it.
