#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${GHOSTTY_WEB_DIR:-${repo_dir}/ghostty-web}"
native_dir="${source_dir}/ghostty"
patches=("${source_dir}/patches/ghostty-wasm-api.patch" "${source_dir}/patches/ghostty-scrollback-generation.patch" "${repo_dir}/tools/ghostty-reflow.patch")
applied=()

command -v zig >/dev/null
# Keep upstream checkouts untouched after building, including failed builds.
# Keep the shipped optimization mode while applying WebShell's measured fix.
cleanup() {
  local index
  for ((index=${#applied[@]}-1; index>=0; index--)); do
    git -C "$native_dir" apply -R "${applied[index]}"
  done
}
trap cleanup EXIT
for patch in "${patches[@]}"; do
  git -C "$native_dir" apply --check "$patch"
  git -C "$native_dir" apply "$patch"
  applied+=("$patch")
done
(
  cd "$native_dir"
  zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall
)
cp "$native_dir/zig-out/bin/ghostty-vt.wasm" "$source_dir/ghostty-vt.wasm"
