# WebShell 测试

本目录维护 Project AC Executor、按 `domain/feature` 组织的测试脚本和 WebShell 环境适配，与 `spec/` 对齐。WebShell 的真实环境操作与观察服务位于 `spec-tests/environment/`；通用设备管理由独立安装的 `agent-device-mcp` skill/MCP 提供，WebShell 项目适配为 `spec-tests/environment/webshell-test-harness/`。

- `run-ac`、`run-ac-entry`、`run-ac.lock`：统一入口与运行时版本。
- `timed-run`：最外层总用时统计，前台/后台与失败退出统一输出；JSON 模式将时间说明写到 stderr。
- `project-ac-executor`、`ac-implementations.json`：AC 到测试模块的映射和执行。
- `app/`、`terminal/`、`workspace/`：与 spec 对应的测试脚本。
- `ENVIRONMENT.md`、`device-workflow.md`：测试条件与设备操作流程。
- `task-context`：按模块读取规格，并通过 `--checkpoint` 保存相关文件指纹，供后续检查变化。
- `reports/`、`artifacts/`：忽略提交的执行报告与调试产物。

开始测试先读 [ENVIRONMENT.md](ENVIRONMENT.md)，明确测试机、登录、实例选择、Google Chrome、X11 DISPLAY、构建产物及权限配置。

从产品根目录运行 `./run-ac.sh --selector terminal/input`，统一入口通过唯一的 Project AC Executor 选择和执行场景。Android 场景使用 `--target android-emulator`；未承接 Android 的场景会明确失败。也可以直接运行桌面批次入口 `./test-all.sh`。

根目录 `run-ac.sh` 指向通用启动器 `spec-tests/run-ac`。无参数只显示帮助；显式使用 `--selector`、`--all` 或 `--auto` 选择范围。`spec-tests/proj-spec.yml` 指定本项目唯一执行器和选择文件。

桌面场景执行前自动构建当前前端，并给整批测试固定同一份产物快照；页面和资源校验构建摘要。Android 场景从当前工作树构建完整 LightOS LPK，每批通过所选设备的网络通道核对 `debug123` 正在运行的文件；内容不一致时安装本批次 LPK，再比较运行目录文件摘要、Android 应用访问到的服务修订与实际加载的 JS、WASM 摘要。安装或核验失败则停止测试。`--dry-run` 和 `--help` 不构建、不申请设备。

Android 设备由 `WEBSHELL_DEVICE_MCP_URL` 指向的 device-hub MCP 申请，`WEBSHELL_DEVICE_MCP_OWNER`、`WEBSHELL_DEVICE_NAME` 和 `WEBSHELL_DEVICE_KIND` 明确绑定目标。MCP 返回限域 ADB 连接；WebShell 专属适配在 `environment/webshell-test-harness/`，场景仍放在对应的 `domain/feature/` 下。该设备当前是 Pixel 9 Pro Android 模拟器，不记为物理手机验收。

```sh
(cd spec-tests && npm ci)
npx skills add git@gitee.com:linakesi/agent-device-mcp.git
node spec-tests/environment/webshell-test-harness/inspect.mjs
TESTS_AUTO_DRY_RUN=1 spec-tests/test-all.sh
```

`spec-tests/environment/webshell-test-harness/config.mjs` 加载本地配置；同目录的 `target.mjs` 处理认证和实例选择，`browser.mjs` 管理现有 Playwright 桌面场景的浏览器窗口；`spec-tests/run-suite.mjs` 编排批次并输出逐模块结果。Agent 通过已安装的 `agent-device-mcp` skill 和注册的 MCP 操作通用设备；项目自动脚本使用 `spec-tests` 中固定版本的 `agent-device` npm 依赖。两者都不读取 WebShell 业务配置或决定产品 AC 语义。

新增真实设备流程先加载 `agent-device-mcp` skill；首次使用执行 `npx skills add git@gitee.com:linakesi/agent-device-mcp.git`，后续通过 `npx skills update agent-device-mcp` 更新。产品定制只写在对应模块测试脚本中。现有脚本的模拟范围和限制保留在模块 README，不把桌面移动视口当成 Android 真机覆盖。

原始脚本以场景级断言承接，详细诊断保留在 events.jsonl、trace、截图和 result.json。执行器不要求每个旧模块改用 OCR，也不伪造逐步骤证据。测试产物、登录态和凭据不得提交。
