#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "${script_dir}/.." && pwd)"

# This entry point is intentionally explicit so a demo never inherits a
# headless setting from a caller or from tests-auto/.env.
export TEST_FOREGROUND=1
export HEADLESS=0
if [[ -z "${WEBSHELL_TEST_URL:-}" ]]; then
  echo "tests-auto: set WEBSHELL_TEST_URL for the real deployed target" >&2
  exit 2
fi

if [[ "${1:-}" == "--all" ]]; then
  if (( $# > 1 )); then
    echo "usage: $0 [--all | <case-directory-or-test.mjs>]" >&2
    exit 2
  fi
  exec "${script_dir}/test-all.sh"
fi

if (( $# > 1 )); then
  echo "usage: $0 [--all | <case-directory-or-test.mjs>]" >&2
  exit 2
fi

case_arg="${1:-tests-auto/10-terminal-geometry-jitter/test.mjs}"
if [[ "${case_arg}" != /* ]]; then
  case_arg="${repo_dir}/${case_arg}"
fi
if [[ -d "${case_arg}" ]]; then
  case_arg="${case_arg}/test.mjs"
fi
if [[ ! -f "${case_arg}" ]]; then
  echo "tests-auto: test case not found: ${case_arg}" >&2
  exit 2
fi

echo "[tests-auto] visible Chrome enabled"
echo "[tests-auto] case ${case_arg}"
exec node "${script_dir}/run-playwright.mjs" "${case_arg}"
