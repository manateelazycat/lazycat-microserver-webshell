# WebShell 运行资产

- `static/`：浏览器前端及固定 Ghostty WASM，入口说明见 [前端模块](static/README.md)。
- `fonts/`：随包字体与许可证。
- `assets.go`：Go 资源包 `runtimeassets`，通过 `go:embed static/ghostty-vt.wasm` 为 Core 提供同一份 WASM 字节。

将 checkpoint 实现移入 Core 后，不复制 WASM、不更换 ABI。Go agent 与 Vite 发布仍取自同一个 `static/ghostty-vt.wasm`；沿用原资源同步和校验脚本。

此包只提供资产，不持有会话状态、网络连接或平台适配。构建继续在仓库根目录运行 `go build .` 和 `npm run build`，LPK 发布布局不变。资源兼容性需用真实快照导入验证，不能只比较文件存在。
