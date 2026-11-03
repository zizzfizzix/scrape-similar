#!/usr/bin/env bash
# Brings a checkout up to date with the commit it is on: copies the env files a
# new worktree lacks and reinstalls dependencies when their inputs changed.
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

# git lists the main worktree first. A bare repository has no main checkout to
# copy from, and the parent of the common git dir is not one either in that
# layout or with --separate-git-dir. Both paths come from git, so they compare
# in the same form on Windows, where bash's $PWD reads /c/… and git's C:/….
origin_root=""
{
  IFS= read -r first_line
  IFS= read -r second_line
} < <(git worktree list --porcelain)
if [[ "$second_line" != bare ]]; then
  origin_root=${first_line#worktree }
fi

if [[ -n "$origin_root" && "$origin_root" != "$toplevel" ]]; then
  for env_file in .env .env.test; do
    if [[ ! -e "$env_file" && -f "$origin_root/$env_file" ]]; then
      log "Copying $env_file from $origin_root"
      cp "$origin_root/$env_file" "$env_file"
    fi
  done
fi

# Vite's dotenv parser also accepts `export KEY=…`, spaces around `=` and
# indented lines.
env_keys() {
  sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=.*/\2/p' "$1" | sort -u
}

if [[ -f .env.example && -f .env ]]; then
  missing_keys=$(comm -23 <(env_keys .env.example) <(env_keys .env))
  if [[ -n "$missing_keys" ]]; then
    log "Warning: .env lacks keys that .env.example defines: $(echo "$missing_keys" | tr '\n' ' ')"
  fi
elif [[ -f .env.example ]]; then
  log "Warning: no .env; run 'cp .env.example .env' (the unit tests need it)"
fi

# Everything pnpm resolves the install from. The stamp lives inside node_modules,
# so deleting node_modules also forces a reinstall.
dependency_inputs=(package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc)
stamp_file=node_modules/.worktree-sync-stamp

inputs_hash=$(for input in "${dependency_inputs[@]}"; do
  [[ -f "$input" ]] && git hash-object "$input"
done | git hash-object --stdin)

if [[ -f "$stamp_file" && "$(cat "$stamp_file")" == "$inputs_hash" ]]; then
  exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
  log "Warning: pnpm is not on PATH; run 'pnpm install' yourself"
  exit 0
fi

log "Dependency files changed or node_modules is missing; running pnpm install"
# --frozen-lockfile: a hook must never rewrite the lockfile it was handed.
# confirmModulesPurge=false: without a TTY pnpm aborts instead of asking.
if pnpm install --frozen-lockfile --prefer-offline --config.confirm-modules-purge=false; then
  echo "$inputs_hash" >"$stamp_file"
  log "Done"
else
  log "Warning: pnpm install failed; fix it and run 'pnpm install' by hand"
fi

# A failed sync must not make git report the checkout, merge or rebase as failed.
exit 0
