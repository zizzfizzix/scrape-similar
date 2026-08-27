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
