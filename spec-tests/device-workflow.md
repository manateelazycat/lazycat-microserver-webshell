# 真实设备操作

真机 Environment MCP 在 [environment/agent-device-mcp/README.md](../environment/agent-device-mcp/README.md)。它基于 `agent-device`，覆盖 Android、iOS 和浏览器会话，不包含产品登录或 AC 判定。

Agent 写真机脚本时：

1. 读 `environment/agent-device-mcp/README.md`。
2. 需要命令细节时再读官方 `agent-device` skill，或 `npx agent-device help <topic>`。
3. 产品步骤只写进 `spec-tests/<domain>/<feature>/` 的测试脚本，并调用 `environment/agent-device-mcp/client.mjs`。

## 工具

- Environment MCP：在 `environment/agent-device-mcp/` 下执行 `npm run mcp`。
- Node API：`environment/agent-device-mcp/client.mjs`。
- 官方 skill：`agent-device`。
- CLI 包装：`environment/agent-device-mcp/device`，注入本机 Android SDK/AVD 路径；产品 `open/replay/test/batch` 仍要求已验证的本地前端通道。

## 发布目标

配置真源为 `release-targets.json`。

| 目标 | 设备与使用方式 | 验证重点 |
| --- | --- | --- |
| desktop-browser | 实际桌面浏览器；现有 Playwright AC 或 agent-device web session | 键盘、终端画面、标签操作 |
| android-emulator | 指定 Android 模拟器中的真实应用和系统键盘 | 触摸、键盘遮挡、系统 IME 与候选词 |
| android-device | 指定且已授权的 Android 物理设备 | 发布前验收、硬件或厂商系统差异 |

`WEBSHELL_ANDROID_SERIAL` 或 `WEBSHELL_ANDROID_DEVICE` 指定一个目标。缺失、歧义或设备类型不匹配时失败，不能从物理设备静默切换到模拟器。模拟器与物理设备证据分别标明；浏览器移动视口不算 Android 验证。

## Android 原生输入法

Android 模拟器默认的 agent-device 测试 IME 适合文字注入，但不能作为系统输入法证据。原生 IME 场景在 `session_open` 时设 `testIme: false`。实际操作系统键盘、拼音候选、确认提交及退格，并观察终端最终文字。`fill`、`type`、ADB 文字注入和 DOM composition 事件不能替代这些操作。

认证从本地配置注入，不把凭据写进录制脚本。临时截图、session 数据和设备标识留在被忽略的产物目录。
