# Vite 产物冷启动回归

规格：[REQ](../../../spec/app/vite-cold-start/REQ.md) · [AC](../../../spec/app/vite-cold-start/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector app/vite-cold-start`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / mobile / lifecycle
- 真实依赖：Provider、persistent agent、PTY、WebSocket、真实 Chrome 冷缓存上下文
- 相关模块和源码入口：`runtime/static/index.html`、`runtime/static/main.js`、`vite.config.js`、`lzc-build.yml`、`spec-tests/run-playwright.mjs`

## 触发条件

使用全新的浏览器上下文打开刚发布或资源版本刚变化的 WebShell，浏览器尚未缓存当前版本的静态资源。

## 用户可见问题

源码模块被直接发布时，首屏会并发请求两百多个 JavaScript 文件。资源受限的 Chrome/WebView 偶发返回 `net::ERR_INSUFFICIENT_RESOURCES`，任一入口依赖失败都会使应用运行时无法启动，终端区域保持黑屏。

## 预防的回归

- 发布入口必须加载 Vite bundle，不能重新直接发布源码模块树。
- 单个冷缓存页面的 JavaScript 资源数量不得超过 8 个。
- 不得出现版本化静态资源请求失败。
- 真实终端必须连接成功，并呈现非空 Canvas。

## 修复前基线

- 运行日期：2026-09-04
- 浏览器：本机 Google Chrome；运行器创建的全新 desktop/mobile context
- 前端资源：`WEBSHELL_LOCAL_STATIC_DIR=$PWD/runtime/static`
- 结果：失败；单个页面加载 244 个 JavaScript 资源，超过 8 个的发布预算。
- 诊断证据：源码入口可达 242 个 ES Module，依赖图最大一层同时暴露 143 个模块请求。

## 已确认根因

2026-08-31 的前端模块化保留了清晰的源码职责边界，但 LPK 仍直接复制 `runtime/static`。浏览器因此把源码模块图当成生产资源逐文件请求；冷缓存和受限 WebView 下会耗尽浏览器请求资源。

## 实施方案

- 使用 Vite 8.2.2 以 `runtime/static/index.html` 为入口，将 249 个源码模块构建为 `build/runtime/static/` 下的有界生产 bundle。
- Vite 保留 Provider 的 `__LCMD_ASSET_BASE__` 版本化资源占位，并显式输出 Ghostty WASM、主题 JSON、CSS、许可证和旧 Service Worker 退役脚本。
- `tools/verify-vite-build.mjs` 要求 `.vite/manifest.json` 存在、JavaScript 文件不超过 8 个，且产物不得包含 `global-runtime.js` 或 `workspace/` 源码树。
- `lzc-build.yml` 在 release 中执行干净的 `npm ci` 和 Vite build，只复制 `build/runtime/` 与 `runtime/fonts/`。
- `lightos-admin/lzc-build.yml` 和根目录 `lightos-build.sh` 同时验证内嵌 runtime 的 Vite manifest、资源预算、源码树缺失和独立/内嵌产物一致性。
- spec-tests 本地资源模式同时替换入口 HTML 与版本化静态资源，确保真实 Provider/API/PTY/WebSocket 使用的正是待发布 Vite 产物。

## 验证预期

- 使用 `build/runtime/static` 映射当前 Vite 构建产物。
- desktop 和 mobile 的 JavaScript 资源数量均不超过 8。
- 所有版本化静态资源加载成功。
- 活动 pane 的真实终端 Canvas 尺寸大于零且包含非透明像素。
- 容器实例保持一条活动 Unified WebSocket。

## 运行命令和环境变量

修复前源码基线：

```sh
HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/app/vite-cold-start/test.mjs
```

修复后 Vite 产物：

```sh
npm run build
HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/app/vite-cold-start/test.mjs
```

## 产物与失败诊断

运行器将截图、trace、错误摘要和 JSONL 事件写入本目录的 `artifacts/`。事件记录包含每个窗口的 JavaScript URL、版本化资源请求失败、Canvas 像素摘要和 Unified WebSocket 数量。

- 修复前：`artifacts/2026-09-04T08-15-54-530Z/`，desktop 加载 244 个 JavaScript 资源，按预期超过预算并失败。
- 修复后：`artifacts/2026-09-04T08-22-48-112Z/`，desktop/mobile 均只加载 2 个首屏 JavaScript 资源，无静态资源失败；Canvas 分别为 `1440x861`、`390x722` 且包含非透明像素，每页 1 条活动 Unified WebSocket。
- `npm ci --ignore-scripts --no-audit --no-fund`、`npm run build`、`node --test tests/*.mjs`（423 项）、`go test ./... -count=1` 和 `git diff --check` 通过。
- 根目录 `./lightos-build.sh` 完整通过；独立 WebShell LPK 与 LightOS Admin 内嵌 runtime 均为 4 个 JavaScript 文件且目录完全一致。产物为 `lazycat-microserver-webshell/dist/local-lcmd-webshell.lpk` 和 `lightos-admin/dist/cloud.lazycat.lightos.entry-v0.3.59-135.lpk`，两者 `lzc-cli lpk lint` 均无警告。
- `lightos-admin` 的 `go test ./... -count=1` 和 `git diff --check` 通过。

## 已知限制

本机 Chrome 的资源上限高于部分移动 WebView，源码基线没有真实产生 `ERR_INSUFFICIENT_RESOURCES`；资源数量断言固定导致该错误的发布不变量。尚未把新 LPK 安装到目标 Android/iOS WebView，正式发布前仍需执行一次安装后的冷缓存验收。
