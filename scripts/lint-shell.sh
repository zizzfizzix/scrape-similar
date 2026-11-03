#!/usr/bin/env bash
# Runs shellcheck on the scripts given, or on every tracked shell script.
#
# The linter is a system tool rather than a dev dependency: the npm wrappers
# download the binary through some 75 packages, and the CI runners ship it. CI
# fails without it; a local run without it only says how to install it, so a
# commit is never blocked on a missing linter that CI will run anyway.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

files=("$@")
if [[ ${#files[@]} -eq 0 ]]; then
  while IFS= read -r file; do
    files+=("$file")
  done < <(git ls-files -- '*.sh')
fi

if ! command -v shellcheck >/dev/null 2>&1; then
  if [[ -n "${CI:-}" ]]; then
    echo "shellcheck is not installed" >&2
    exit 1
  fi
  echo "shellcheck is not installed; skipping (brew, apt, dnf and scoop all package it as 'shellcheck')"
  exit 0
fi

shellcheck "${files[@]}"
