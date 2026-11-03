#!/usr/bin/env node
// Installs lefthook's git hooks. Wired up as the `prepare` npm script, so it
// runs on every `pnpm install`.
//
// `lefthook install` exits non-zero when there is no git repository to install
// hooks into, which would break `pnpm install` from a source archive without a
// .git directory - e.g. the sources bundle submitted to AMO. Skip that one case
// explicitly, so that every other lefthook failure still fails the install.

import { spawnSync } from 'node:child_process'

const isGitRepository =
  spawnSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' }).status === 0

if (!isGitRepository) {
  console.log('No git repository found - skipping lefthook install.')
  process.exit(0)
}

// The worktree sync hook sets this for the install it runs. The hooks are
// installed already, and `lefthook install` would rewrite the lefthook path
// recorded in the hooks every worktree shares to this worktree's node_modules,
// leaving them pointing at nothing once the worktree is removed.
if (process.env.SKIP_GIT_HOOKS_INSTALL === '1') {
  process.exit(0)
}

// Windows needs a shell to resolve the `lefthook.cmd` shim in node_modules/.bin.
const { status, error } = spawnSync('lefthook', ['install'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (error) {
  console.error(`Failed to run lefthook install: ${error.message}`)
  process.exit(1)
}

process.exit(status ?? 1)
