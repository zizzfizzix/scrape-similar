#!/usr/bin/env bash
# Brings a checkout up to date with the commit it is on: copies the env files a
# new worktree lacks and reinstalls dependencies when their inputs changed.
# Run by lefthook after checkout, merge and rewrite (see lefthook.yml).
#
# It works from the state of the checkout rather than from git's hook arguments,
# because tools create worktrees differently: `git worktree add` passes an
# all-zero previous HEAD to post-checkout, but `worktree add --no-checkout`
# followed by `reset --hard` and `checkout -b` never does, and `reset` runs no
# hook at all.

set -uo pipefail

log() { echo "[worktree-sync] $*"; }

cd "$(git rev-parse --show-toplevel)" || exit 0

# The main checkout is the parent of the common git dir; every worktree shares it.
origin_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")

if [[ "$origin_root" != "$PWD" ]]; then
  for env_file in .env .env.test; do
    if [[ ! -e "$env_file" && -f "$origin_root/$env_file" ]]; then
      log "Copying $env_file from $origin_root"
      cp "$origin_root/$env_file" "$env_file"
    fi
  done
fi

if [[ -f .env.example && -f .env ]]; then
  missing_keys=$(comm -23 \
    <(sed -nE 's/^([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p' .env.example | sort -u) \
    <(sed -nE 's/^([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p' .env | sort -u))
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
