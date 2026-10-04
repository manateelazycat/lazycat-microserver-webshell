# WebShell Test Harness

本目录是 WebShell 项目专属的真实测试环境适配，不是通用 agent-device MCP 的一部分。

它提供：

- `config.mjs`：读取 `spec-tests/.env` 和 WebShell 测试配置
- `frontend-build.mjs`、`local-frontend.mjs`：构建、固定并注入当前工作树前端
- `target.mjs`：真实登录和显式实例选择
- `browser.mjs`、`run.mjs`：Playwright 窗口、场景运行和证据生命周期
- `observe.mjs`：终端截图、OCR 和可见输出等待
- `agent-device.mjs`、`android-load-actions.mjs`：WebShell Android/CDP 与负载场景适配
- `device-hub.mjs`：通过指定 MCP 申请并连接 Pixel 9 Pro，核对设备身份和限域 ADB
- `android-lpk.py`、`android-devtools-relay.go`：构建与安装当前 LightOS LPK，经 Android 网络接入测试机并核对运行文件
- `android-webview.mjs`、`android-cdp.mjs`、`android-version.mjs`：连接已安装的 LightOS WebView，核对实际服务和 JS/WASM 摘要
- `android-workspace.mjs`、`android-terminal.mjs`、`android-observe.mjs`、`android-native-ui.mjs`：专用测试标签、真实输入、屏幕 OCR 与系统文件选择器
- `artifact-redaction.mjs`：报告、trace 和网络证据脱敏

通用设备操作遵循独立安装的 `agent-device-mcp` skill。当前 Android 自动批次使用用户指定的 device-hub MCP 申请设备，再通过它返回的限域 ADB 操作已安装的 LightOS 应用；MCP 不读取 WebShell 配置，也不判定 AC。本目录可以依赖 WebShell 路径、配置和产品 API；这些依赖不得移入通用 MCP/skill。

正式验收从项目根目录的唯一入口运行：

```sh
node spec-tests/environment/webshell-test-harness/inspect.mjs
./run-ac.sh --selector <domain/feature>
```

测试环境和凭据要求见 [spec-tests/ENVIRONMENT.md](../../spec-tests/ENVIRONMENT.md)。
