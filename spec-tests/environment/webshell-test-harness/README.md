# WebShell Test Harness

本目录是 WebShell 项目专属的真实测试环境适配，不是通用 agent-device MCP 的一部分。

它提供：

- `config.mjs`：读取 `spec-tests/.env` 和 WebShell 测试配置
- `frontend-build.mjs`、`local-frontend.mjs`：构建、固定并注入当前工作树前端
- `target.mjs`：真实登录和显式实例选择
- `browser.mjs`、`run.mjs`：Playwright 窗口、场景运行和证据生命周期
- `observe.mjs`：终端截图、OCR 和可见输出等待
- `agent-device.mjs`、`android-load-actions.mjs`：WebShell Android/CDP 与负载场景适配
- `artifact-redaction.mjs`：报告、trace 和网络证据脱敏

通用设备操作使用同级 submodule [agent-device-mcp](../agent-device-mcp/README.md) 的 MCP 或 `client.mjs`。本目录可以依赖 WebShell 路径、配置和产品 API；这些依赖不得移入通用插件。

正式验收从项目根目录的唯一入口运行：

```sh
node spec-tests/environment/webshell-test-harness/inspect.mjs
./run-ac.sh --selector <domain/feature>
```

测试环境和凭据要求见 [spec-tests/ENVIRONMENT.md](../../spec-tests/ENVIRONMENT.md)。
