#!/usr/bin/env bash
# Brings a checkout up to date with the commit it is on: copies the env files a
# new worktree lacks, reinstalls dependencies when their inputs changed, and
# regenerates the .wxt types when the sources they come from changed.
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

is_install_current=false
[[ -f "$stamp_file" && "$(cat "$stamp_file")" == "$inputs_hash" ]] && is_install_current=true
is_wxt_current=false
[[ -f "$wxt_stamp_file" && "$(cat "$wxt_stamp_file")" == "$wxt_inputs_hash" ]] && is_wxt_current=true

if [[ "$is_install_current" == true && "$is_wxt_current" == true ]]; then
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

# A failed sync must not make git report the checkout, merge or rebase as failed.
exit 0
