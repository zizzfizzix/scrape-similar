#!/usr/bin/env bash
# Brings a checkout up to date with the commit it is on: copies the env files a
# new worktree lacks, reinstalls dependencies when their inputs changed,
# regenerates the .wxt types when the sources they come from changed, and keeps
# Playwright's Chromium available for the E2E suite.
# Run by lefthook after checkout, merge, rewrite and commit (see lefthook.yml).
#
# It works from the state of the checkout rather than from git's hook arguments,
# because tools create worktrees differently: `git worktree add` passes an
# all-zero previous HEAD to post-checkout, but `worktree add --no-checkout`
# followed by `reset --hard` and `checkout -b` never does, and `reset` runs no
# hook at all.

set -uo pipefail

log() { echo "[worktree-sync] $*"; }

toplevel=$(git rev-parse --show-toplevel) || exit 0
cd "$toplevel" || exit 0

# `.wxt/` holds the auto-import declarations generated from the exports under
# src/ and from wxt.config.ts. `pnpm compile` and `pnpm lint` regenerate it
# themselves; this keeps it current for the editor, whose TypeScript server and
# ESLint read it directly. Hashing the index rather than the files keeps this
# cheap, and the index changes whenever a git operation moves these files. It
# misses a change to the files alone, such as discarding an unstaged edit with
# `git checkout -- <path>`; the editor then sees the old types until the next
# compile, lint or dev server run regenerates them.
wxt_stamp_file=.wxt/.worktree-sync-stamp
wxt_inputs_hash=$(git ls-files -s -- src public wxt.config.ts | git hash-object --stdin)

# Pre-commit has just run `wxt prepare` against the working tree; recording the
# index it is committing usually lets post-commit find the types current instead
# of regenerating them a second time (not after `git commit <paths>` with other
# changes staged, whose pre-commit sees a temporary index).
if [[ "${1:-}" == --stamp-types ]]; then
  echo "$wxt_inputs_hash" >"$wxt_stamp_file"
  exit 0
fi

# git lists the main worktree first. A bare repository has no main checkout to
# copy from, and with --separate-git-dir git lists the git dir in its place;
# neither has a .git entry, so nothing is copied in those layouts. Both paths
# come from git, so they compare in the same form on Windows, where bash's $PWD
# reads /c/… and git's C:/….
origin_root=""
{
  IFS= read -r first_line
  IFS= read -r second_line
} < <(git worktree list --porcelain)
if [[ "$second_line" != bare ]]; then
  origin_root=${first_line#worktree }
fi

if [[ -n "$origin_root" && -e "$origin_root/.git" && "$origin_root" != "$toplevel" ]]; then
  for env_file in .env .env.test; do
    if [[ ! -e "$env_file" && -f "$origin_root/$env_file" ]]; then
      log "Copying $env_file from $origin_root"
      cp "$origin_root/$env_file" "$env_file"
    fi
  done
fi

# The key forms dotenv, which Vite loads .env with, accepts: an optional
# `export`, indentation, `.` and `-` in names, and `=` or `: ` with spaces.
env_keys() {
  sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z0-9_.-]+)[[:space:]]*(=|:[[:space:]]).*/\2/p' "$1" | sort -u
}

if [[ -f .env.example && -f .env ]]; then
  missing_keys=$(comm -23 <(env_keys .env.example) <(env_keys .env))
  if [[ -n "$missing_keys" ]]; then
    log "Warning: .env lacks keys that .env.example defines: $(paste -sd ' ' - <<<"$missing_keys")"
  fi
elif [[ -f .env.example ]]; then
  log "Warning: no .env; run 'cp .env.example .env' (the unit tests need it)"
fi

# Everything pnpm resolves the install from, plus pnpm's own record of what is
# installed, which it rewrites whenever an install changes node_modules. That
# record makes a `pnpm add` or `pnpm update` run outside the hook count as a
# change, so reverting its edits to package.json reinstalls rather than leaving
# its packages behind. The stamp lives inside node_modules, so deleting
# node_modules also forces a reinstall.
dependency_inputs=(package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc node_modules/.pnpm/lock.yaml)
stamp_file=node_modules/.worktree-sync-stamp

dependency_state_hash() {
  local input
  for input in "${dependency_inputs[@]}"; do
    [[ -f "$input" ]] && git hash-object "$input"
  done | git hash-object --stdin
}
inputs_hash=$(dependency_state_hash)

# The E2E suite launches the full Chromium build pinned by the installed
# Playwright version. Playwright's browser cache is shared by every project on the
# machine, so a test build of this repository in any of its worktrees
# (`pnpm build:test` writes .output/chrome-mv3-test) is what says the suite runs
# here. On such a machine every checkout runs `playwright install` once per
# installed dependency state, even when the browser is present: it downloads only
# what is missing, and it is what registers the checkout's playwright-core in the
# cache's .links. Every install on the machine deletes browsers no registered
# checkout still uses, so an unregistered checkout could lose its browser to
# another project's install. `--no-shell` leaves out the headless shell, which
# the suite never launches.
#
# Any other machine is only told how, after an install, when `--dry-run` (which
# lists the install directories without downloading) shows one lacking the
# INSTALLATION_COMPLETE marker Playwright writes once a download has finished.
playwright_args=(install --no-shell chromium)
playwright_command="pnpm exec playwright ${playwright_args[*]}"
playwright_stamp_file=node_modules/.worktree-sync-playwright-stamp

has_e2e_build=false
while IFS= read -r worktree_line; do
  if [[ "$worktree_line" == "worktree "* && -d "${worktree_line#worktree }/.output/chrome-mv3-test" ]]; then
    has_e2e_build=true
    break
  fi
done < <(git worktree list --porcelain)

is_install_current=false
[[ -f "$stamp_file" && "$(cat "$stamp_file")" == "$inputs_hash" ]] && is_install_current=true
is_wxt_current=false
[[ -f "$wxt_stamp_file" && "$(cat "$wxt_stamp_file")" == "$wxt_inputs_hash" ]] && is_wxt_current=true
is_browser_current=true
if [[ "$has_e2e_build" == true ]]; then
  [[ -f "$playwright_stamp_file" && "$(cat "$playwright_stamp_file")" == "$inputs_hash" ]] ||
    is_browser_current=false
fi

if [[ "$is_install_current" == true && "$is_wxt_current" == true && "$is_browser_current" == true ]]; then
  exit 0
fi

# A failed install is not retried until the dependency files change or someone
# installs by hand: a hand-edited package.json or a stale lockfile would
# otherwise make every commit wait for pnpm to fail again. The record lives in
# this worktree's git dir, since node_modules may not exist.
failed_stamp_file=$(git rev-parse --git-path worktree-sync-install-failed)
# pnpm rewrites .modules.yaml on every install it gets as far as linking, even
# one with nothing to change, so a newer one means someone has installed since
# the failure (as the warning asks); a failure in a lifecycle script leaves the
# hashed files as they were, so the hash alone would not notice.
if [[ -f "$failed_stamp_file" && node_modules/.modules.yaml -nt "$failed_stamp_file" ]]; then
  rm -f "$failed_stamp_file"
fi

hint_missing_browser() {
  local install_locations location
  # Playwright prints Windows paths with backslashes; Git Bash takes C:/… paths.
  install_locations=$(node_modules/.bin/playwright install --dry-run "${playwright_args[@]:1}" 2>/dev/null |
    sed -nE 's/^[[:space:]]*Install location:[[:space:]]*//p' | tr '\134' '/')
  if [[ -z "$install_locations" ]]; then
    log "Could not find where Playwright keeps its Chromium; if the E2E suite fails, run '$playwright_command'"
    return 0
  fi
  while IFS= read -r location; do
    if [[ ! -f "$location/INSTALLATION_COMPLETE" ]]; then
      log "To run the E2E suite, first run '$playwright_command'"
      return 0
    fi
  done <<<"$install_locations"
}

was_installed=false

if [[ "$is_install_current" == false ]]; then
  if [[ -f "$failed_stamp_file" && "$(cat "$failed_stamp_file")" == "$inputs_hash" ]]; then
    log "Warning: pnpm install failed for these dependency files; fix the cause (it may have been the network) and run 'pnpm install'"
  elif ! command -v pnpm >/dev/null 2>&1; then
    log "Warning: pnpm is not on PATH; run 'pnpm install' yourself"
  else
    log "Dependency files changed or node_modules is missing; running pnpm install"
    # --frozen-lockfile: a hook must never rewrite the lockfile it was handed.
    # confirmModulesPurge=false: without a TTY pnpm aborts instead of asking.
    # SKIP_GIT_HOOKS_INSTALL: see scripts/install-git-hooks.mjs.
    if SKIP_GIT_HOOKS_INSTALL=1 pnpm install --frozen-lockfile --prefer-offline --config.confirm-modules-purge=false; then
      dependency_state_hash >"$stamp_file"
      rm -f "$failed_stamp_file"
      was_installed=true
      log "Done"
    else
      # The state after the attempt, which a partly finished install may have changed.
      dependency_state_hash >"$failed_stamp_file"
      log "Warning: pnpm install failed and is not retried until the dependency files change or you run 'pnpm install'; fix the cause (it may have been the network) and run it"
    fi
  fi
fi

# Separate from the install, whose postinstall also runs `wxt prepare` unless
# scripts are disabled, so the stamp records only a run seen to succeed. Calling
# wxt from node_modules needs only node on PATH, not pnpm, which git GUIs often
# run hooks without. Its output is shown only on failure: Node prints warnings
# on every run.
# A failure is recorded like a failed install, so a branch whose wxt.config.ts
# does not load prints wxt's output once, not on every checkout.
wxt_failed_stamp_file=$(git rev-parse --git-path worktree-sync-types-failed)
if [[ "$is_wxt_current" == false && -f node_modules/.bin/wxt ]]; then
  if [[ -f "$wxt_failed_stamp_file" && "$(cat "$wxt_failed_stamp_file")" == "$wxt_inputs_hash" ]]; then
    log "Warning: 'wxt prepare' failed for these sources; run 'pnpm exec wxt prepare' by hand"
  elif wxt_output=$(node_modules/.bin/wxt prepare 2>&1); then
    echo "$wxt_inputs_hash" >"$wxt_stamp_file"
    rm -f "$wxt_failed_stamp_file"
    log "Regenerated .wxt types"
  else
    echo "$wxt_output"
    echo "$wxt_inputs_hash" >"$wxt_failed_stamp_file"
    log "Warning: 'wxt prepare' failed; run 'pnpm exec wxt prepare' by hand"
  fi
fi

# Only against a current install, so the stamp names the Playwright version that
# was registered. The stamp records a finished attempt, not just a success: a
# machine that cannot reach Playwright's CDN would otherwise wait out its
# timeouts on every later commit. It is written after the install returns, so a
# download cut short by Ctrl-C, which ends this script too, is retried. It is not
# written when node is missing from PATH (as in some git GUIs), since Playwright
# never ran. A browser removed later by other means (a cache cleaner,
# `playwright uninstall`) comes back with the next dependency change; until then
# Playwright's launch error names the install command.
current_state_hash=$(dependency_state_hash)
if [[ -f node_modules/.bin/playwright && "$(cat "$stamp_file" 2>/dev/null)" == "$current_state_hash" ]]; then
  if [[ "$has_e2e_build" == true && "$(cat "$playwright_stamp_file" 2>/dev/null)" != "$current_state_hash" ]]; then
    if ! command -v node >/dev/null 2>&1; then
      log "Warning: node is not on PATH; run '$playwright_command' yourself"
    else
      node_modules/.bin/playwright "${playwright_args[@]}" ||
        log "Warning: Chromium install failed; run '$playwright_command' by hand"
      echo "$current_state_hash" >"$playwright_stamp_file"
    fi
  elif [[ "$has_e2e_build" == false && "$was_installed" == true ]]; then
    hint_missing_browser
  fi
fi

# A failed sync must not make git report the checkout, merge or rebase as failed.
exit 0
