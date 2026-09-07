# WebShell 测试

本目录统一维护执行器、测试场景、浏览器/Android 环境、MCP 和设备工具。`tests-auto/` 保留 18 个既有分类、测试脚本和完整场景说明；每个模块通过注册表关联仓库 `spec/webshell/<模块名>/REQ.md` 与 `AC.md`。

- `run-ac`、`run-ac-entry`、`run-ac.lock`：统一入口与运行时版本。
- `timed-run`：最外层总用时统计，前台/后台与失败退出统一输出；JSON 模式将时间说明写到 stderr。
- `project-ac-executor`、`ac-implementations.json`：AC 到既有测试模块的映射和执行。
- `tests-auto/`、`tests-android/`：场景脚本与 Android 环境脚本。
- `environment/`、`mcp/`、`device`：共享环境能力与 agent-device 操作入口。
- `ENVIRONMENT.md`、`device-workflow.md`：测试条件与设备操作流程。
- `task-context`：按模块读取规格，并通过 `--checkpoint` 保存相关文件指纹，供后续检查变化。
- `reports/`、`artifacts/`：忽略提交的执行报告与调试产物。

开始测试先读 [ENVIRONMENT.md](ENVIRONMENT.md)，明确测试机、登录、实例选择、Google Chrome、X11 DISPLAY、构建产物及权限配置。

从产品根目录运行 `./run-ac.sh`，统一入口会调用 `tests-auto/test-all.sh` 执行全部模块；指定 `--selector webshell/<模块名>` 时仍使用同一批次入口，只执行所选模块。也可以直接运行本目录的 `tests-auto/test-all.sh`。

根目录 `run-ac.sh` 指向项目包装器 `spec-tests/run-ac-entry`，由它提供默认全量和总用时输出，再调用通用启动器 `spec-tests/run-ac`。通用运行时工具提示根入口与默认目标不同属于此项目约定，更新运行时时应保留该包装器。

正式执行前自动构建当前前端，并给整批测试固定同一份产物快照；页面和资源校验构建摘要。本地资源缺失直接失败，不能回退到远端旧前端。`--dry-run` 和 `--help` 不执行构建或测试。

```sh
cd spec-tests
npm ci
(cd tests-auto && npm ci)
node environment/inspect.mjs
TESTS_AUTO_DRY_RUN=1 tests-auto/test-all.sh
```

`environment/config.mjs` 加载本地配置；`environment/target.mjs` 处理认证和实例选择；`environment/browser.mjs` 管理浏览器、隔离标签和清理；`tests-auto/run-suite.mjs` 编排批次并输出逐模块结果。`mcp/server.mjs` 复用环境能力供 Agent 操作，不决定产品 AC 语义。

新增真实设备流程使用已安装的 agent-device skill，按 [device-workflow.md](device-workflow.md) 选择桌面浏览器或 Android 模拟器/物理设备。现有脚本的模拟范围和限制保留在模块 README，不把桌面移动视口当成 Android 真机覆盖。

原始脚本以场景级断言承接，详细诊断保留在 events.jsonl、trace、截图和 result.json。执行器不要求每个旧模块改用 OCR，也不伪造逐步骤证据。测试产物、登录态和凭据不得提交。
