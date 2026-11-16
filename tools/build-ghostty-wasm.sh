#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${GHOSTTY_WEB_DIR:-${repo_dir}/ghostty-web}"
native_dir="${source_dir}/ghostty"
patch="${source_dir}/patches/ghostty-1.4-webshell.patch"
graphics_patch="${source_dir}/patches/ghostty-wasm-graphics.patch"
graphics_applied=0
abi_source="${source_dir}/wasm/webshell_abi.zig"
abi_target="${native_dir}/src/webshell_abi.zig"
applied=0

command -v zig >/dev/null
# Keep the upstream checkout untouched after building, including failed builds.
cleanup() {
  rm -f "$abi_target" "${native_dir}/src/webshell_images.zig"
  if [[ "$graphics_applied" == 1 ]]; then
    git -C "$native_dir" apply -R "$graphics_patch"
  fi
  if [[ "$applied" == 1 ]]; then
    git -C "$native_dir" apply -R "$patch"
  fi
}
trap cleanup EXIT
git -C "$native_dir" apply --check "$patch"
git -C "$native_dir" apply "$patch"
applied=1
git -C "$native_dir" apply --check "$graphics_patch"
git -C "$native_dir" apply "$graphics_patch"
graphics_applied=1
cp "$abi_source" "$abi_target"
cp "${source_dir}/wasm/webshell_images.zig" "${native_dir}/src/webshell_images.zig"
(
  cd "$native_dir"
  # Browser, server checkpoint engine and wasm2c native clients share this
  # generic (non-SIMD) module so a snapshot always decodes with the same core.
  zig build -Demit-lib-vt -Dtarget=wasm32-freestanding -Dcpu=generic -Doptimize=ReleaseSmall
)
cp "$native_dir/zig-out/bin/ghostty-vt.wasm" "$source_dir/ghostty-vt.wasm"
