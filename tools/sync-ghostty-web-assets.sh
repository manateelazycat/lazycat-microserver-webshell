#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
GHOSTTY_WEB_DIR="${GHOSTTY_WEB_DIR:-${REPO_DIR}/ghostty-web}"
STATIC_DIR="${REPO_DIR}/runtime/static"

usage() {
  cat <<'EOF'
用法:
  ./tools/sync-ghostty-web-assets.sh --check
  ./tools/sync-ghostty-web-assets.sh --check-source
  ./tools/sync-ghostty-web-assets.sh --sync
  ./tools/sync-ghostty-web-assets.sh --rebuild-wasm-only
  ./tools/sync-ghostty-web-assets.sh --rebuild-wasm

说明:
  --check         校验随包资产，并从 Ghostty Web submodule 重建 WASM 比较核心 section。
  --check-source  显式执行与 --check 相同的源码 WASM 校验。
  --sync                构建并同步 JavaScript/许可证；要求现有源 WASM 核心内容已一致。
  --rebuild-wasm-only   每次重建并同步 WASM，不覆盖 WebShell 定制 JavaScript。
  --rebuild-wasm        重建 WASM 和 JavaScript，再同步全部运行时资产。

可选环境变量:
  GHOSTTY_WEB_DIR 覆盖仓库内 ghostty-web submodule 路径。
EOF
}

mode="${1:---check}"
if [[ $# -gt 1 ]]; then
  usage >&2
  exit 1
fi
case "$mode" in
  --check|--check-source|--sync|--rebuild-wasm-only|--rebuild-wasm)
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    echo "未知参数: ${mode}" >&2
    usage >&2
    exit 1
    ;;
esac

source_wasm="${GHOSTTY_WEB_DIR}/ghostty-vt.wasm"
runtime_wasm="${STATIC_DIR}/ghostty-vt.wasm"
runtime_js="${STATIC_DIR}/ghostty-web.js"
runtime_license="${STATIC_DIR}/ghostty-web.LICENSE"
wasm_comparator="${REPO_DIR}/tools/compare-wasm-content.mjs"
if [[ ! -f "$runtime_wasm" ]]; then
  echo "缺少 WebShell WASM: ${runtime_wasm}" >&2
  exit 1
fi
if [[ ! -s "$runtime_js" ]]; then
  echo "缺少 WebShell Ghostty JavaScript: ${runtime_js}" >&2
  exit 1
fi
if [[ ! -s "$runtime_license" ]]; then
  echo "缺少 WebShell Ghostty 许可证: ${runtime_license}" >&2
  exit 1
fi

if [[ "$(od -An -tx1 -N4 "$runtime_wasm" | tr -d ' \n')" != "0061736d" ]]; then
  echo "WebShell WASM 文件头无效: ${runtime_wasm}" >&2
  exit 1
fi

check_runtime_assets() {
  echo "Ghostty WASM: $(wc -c < "$runtime_wasm" | tr -d ' ') bytes"
  echo "Ghostty Web JS: $(wc -c < "$runtime_js" | tr -d ' ') bytes"
}

require_source_tree() {
  if [[ ! -d "$GHOSTTY_WEB_DIR" ]]; then
    echo "找不到 Ghostty Web 源码目录: ${GHOSTTY_WEB_DIR}" >&2
    echo "请执行 git submodule update --init --recursive ghostty-web" >&2
    return 1
  fi
  if [[ ! -f "${GHOSTTY_WEB_DIR}/package.json" || ! -x "${GHOSTTY_WEB_DIR}/scripts/build-wasm.sh" ]]; then
    echo "Ghostty Web 源码目录不完整: ${GHOSTTY_WEB_DIR}" >&2
    echo "请执行 git submodule update --init --recursive ghostty-web" >&2
    return 1
  fi
}

require_bun() {
  if ! command -v bun >/dev/null 2>&1; then
    echo "检查或同步 Ghostty Web 资产需要 bun" >&2
    return 1
  fi
}

compare_source_wasm_content() {
  if [[ ! -f "$source_wasm" ]]; then
    echo "缺少 Ghostty 源 WASM: ${source_wasm}" >&2
    return 1
  fi
  if [[ ! -f "$wasm_comparator" ]]; then
    echo "缺少 WASM 内容比较器: ${wasm_comparator}" >&2
    return 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "比较 WASM 核心内容需要 node" >&2
    return 1
  fi

  if cmp -s "$source_wasm" "$runtime_wasm"; then
    echo "Ghostty 源 WASM 与 WebShell 随包 WASM 内容完全一致。"
    return 0
  fi
  if ! node "$wasm_comparator" "$source_wasm" "$runtime_wasm"; then
    echo "Ghostty 源 WASM 与 WebShell 随包 WASM 的实际核心内容不一致。" >&2
    echo "请核对 Ghostty 源码、patch 和 ABI；确认升级后再执行 --rebuild-wasm。" >&2
    return 1
  fi
  echo "Ghostty WASM 核心内容一致；差异仅位于可变的自定义 section。"
}

verify_source_wasm() {
  require_source_tree
  require_bun
  GHOSTTY_WEB_DIR="$GHOSTTY_WEB_DIR" bash "$REPO_DIR/tools/build-ghostty-wasm.sh"
  compare_source_wasm_content
}

if [[ "$mode" == "--check" ]]; then
  check_runtime_assets
  verify_source_wasm
  exit 0
fi

if [[ "$mode" == "--check-source" ]]; then
  check_runtime_assets
  verify_source_wasm
  exit 0
fi

require_source_tree
require_bun

if [[ "$mode" == "--rebuild-wasm-only" ]]; then
  GHOSTTY_WEB_DIR="$GHOSTTY_WEB_DIR" bash "$REPO_DIR/tools/build-ghostty-wasm.sh"
  if [[ ! -f "$source_wasm" ]]; then
    echo "Ghostty WASM 构建未生成 ${source_wasm}" >&2
    exit 1
  fi
  cp "$source_wasm" "$runtime_wasm"
  check_runtime_assets
  compare_source_wasm_content
  echo "Ghostty WASM 已重建并同步；保留 WebShell 定制 JavaScript。"
  exit 0
fi

if [[ "$mode" == "--rebuild-wasm" ]]; then
  GHOSTTY_WEB_DIR="$GHOSTTY_WEB_DIR" bash "$REPO_DIR/tools/build-ghostty-wasm.sh"
  (cd "$GHOSTTY_WEB_DIR" && bun run build:lib)
else
  (cd "$GHOSTTY_WEB_DIR" && bun run build:lib)
  compare_source_wasm_content
fi

source_js="${GHOSTTY_WEB_DIR}/dist/ghostty-web.js"
if [[ ! -f "$source_js" ]]; then
  echo "Ghostty Web 构建未生成 ${source_js}" >&2
  exit 1
fi

cp "$source_js" "${STATIC_DIR}/ghostty-web.js"
if [[ "$mode" == "--rebuild-wasm" ]]; then
  cp "$source_wasm" "$runtime_wasm"
fi
cp "${GHOSTTY_WEB_DIR}/LICENSE" "${STATIC_DIR}/ghostty-web.LICENSE"
check_runtime_assets
compare_source_wasm_content
echo "Ghostty Web 运行时资产已同步。"
