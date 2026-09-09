# 静态运行时入口

`runtime/static/` 是 WebShell 页面源码根目录。页面脚本只从 `main.js` 开始加载；`main.js` 仅导入并调用 `global-runtime.js` 的 `startGlobalRuntime()`。发布时 Vite 将该模块树构建到 `build/runtime/static/`，LPK 只打包构建产物，不直接发布源码模块。

## 根目录职责

- `main.js`：唯一页面脚本入口，不实现业务逻辑。
- `global-runtime.js`：全局运行时唯一 owner，负责全局状态声明、feature controller 创建、启动/恢复/销毁顺序和显式依赖接线。
- `i18n.js`：浏览器语言默认驱动的轻量国际化运行时，支持模板标记 `{{ $t('中文') }}`，并在运行时输出阶段自动本地化 DOM 文案。
- `index.html`、`style.css`：页面结构和样式。
- `ghostty-web.js`、`ghostty-vt.wasm`：随包发布的终端运行时。
- `vendor/`：第三方宿主适配，只能通过明确公开 API 使用。

当前页面不注册 Service Worker，不提供 Web App Manifest，也不使用 PWA app-shell 缓存。`index.html` 在版本化资源之前仅对仍被旧 Worker 控制的页面调用一次现有 registration 的 `update()`；Provider 在旧 `/service-worker.js` URL 提供一次性退役脚本，使历史 registration 能够删除已知旧缓存、注销自身并重载受控页面。该触发器不注册 Worker、不直接重载页面，退役脚本没有 fetch listener、预缓存或 client claim；干净用户没有 controller，不会请求 Worker 或增加导航。静态资源继续通过 Provider 注入的版本化 `/assets/<asset-version>/` URL 和 HTTP immutable 缓存发布；API、WebSocket 和终端历史不经过浏览器 Cache API。

## 构建和发布边界

- `vite.config.js` 以本目录的 `index.html` 为入口，把源码模块、Ghostty 运行时、WASM、主题和 CSS 构建到 `build/runtime/static/`。
- 构建后的 `index.html` 保留 `__LCMD_ASSET_BASE__`，由 Provider 在响应入口页面时替换为当前内容版本路径。
- `.vite/manifest.json` 是 Vite 产物标记。独立 WebShell LPK 和 `lightos-admin` 内嵌 WebShell 都必须包含该文件。
- `tools/verify-vite-build.mjs` 固定发布 JS 文件不超过 8 个，拒绝把 `global-runtime.js` 或 `workspace/` 等源码模块复制到构建目录。
- `runtime/fonts/` 不经过 Vite 转换，由 LPK 构建脚本与 Vite 静态产物一起组装为最终 `runtime/`。

## 模块目录

业务和责任域必须位于对应目录，并由目录根 `README.md` 说明职责、状态 owner、公开入口、生命周期和验证方式。主要目录包括 `app/`、`workspace/`、`terminal/`、`appearance/`、`settings/`、`diagnostics/`、`instances/`、`devices/`、`attachments/`、`service_forwarding/` 和 `ui/`。

模块外部只能通过各目录的 `index.js` 使用公开 API。不得从 `main.js` 或其他模块深度导入内部实现，不得复制全局状态，也不得显示 history replay、snapshot、原子 resize 或重连中间过程。桌面分屏/窗口及已提交终端字号/行高的 live geometry 只允许呈现当前 session 的真实 Canvas，不改变 replay 与恢复的原子提交边界。

## 最小验证

```sh
find runtime/static -name '*.js' -print0 | xargs -0 -n1 node --check
npm ci --ignore-scripts --no-audit --no-fund
npm run build
node --test tests/*.mjs
go test ./... -count=1
git diff --check
```
