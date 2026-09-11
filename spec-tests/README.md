# WebShell 测试

本目录维护 Project AC Executor 和按 `domain/feature` 组织的测试脚本，与 `spec/` 对齐。真实环境操作与观察服务按插件分类放在仓库根目录 `environment/`；当前插件为 `environment/agent-device-mcp/`。

- `run-ac`、`run-ac-entry`、`run-ac.lock`：统一入口与运行时版本。
- `timed-run`：最外层总用时统计，前台/后台与失败退出统一输出；JSON 模式将时间说明写到 stderr。
- `project-ac-executor`、`ac-implementations.json`：AC 到测试模块的映射和执行。
- `app/`、`terminal/`、`workspace/`：与 spec 对应的测试脚本。
- `ENVIRONMENT.md`、`device-workflow.md`：测试条件与设备操作流程。
- `task-context`：按模块读取规格，并通过 `--checkpoint` 保存相关文件指纹，供后续检查变化。
- `reports/`、`artifacts/`：忽略提交的执行报告与调试产物。

开始测试先读 [ENVIRONMENT.md](ENVIRONMENT.md)，明确测试机、登录、实例选择、Google Chrome、X11 DISPLAY、构建产物及权限配置。

从产品根目录运行 `./run-ac.sh`，统一入口会调用本目录 `test-all.sh` 执行全部模块；指定 `--selector terminal/input` 这类 `domain/feature` 时仍使用同一批次入口，只执行所选模块。也可以直接运行 `./test-all.sh`。

根目录 `run-ac.sh` 指向项目包装器 `spec-tests/run-ac-entry`，由它提供默认全量和总用时输出，再调用通用启动器 `spec-tests/run-ac`。通用运行时工具提示根入口与默认目标不同属于此项目约定，更新运行时时应保留该包装器。

正式执行前自动构建当前前端，并给整批测试固定同一份产物快照；页面和资源校验构建摘要。本地资源缺失直接失败，不能回退到远端旧前端。`--dry-run` 和 `--help` 不执行构建或测试。

```sh
(cd spec-tests && npm ci)
(cd environment/agent-device-mcp && npm ci)
node environment/agent-device-mcp/inspect.mjs
TESTS_AUTO_DRY_RUN=1 spec-tests/test-all.sh
```

`environment/agent-device-mcp/config.mjs` 加载本地配置；`environment/agent-device-mcp/target.mjs` 处理认证和实例选择；`environment/agent-device-mcp/browser.mjs` 管理现有 Playwright 桌面场景的浏览器窗口；`spec-tests/run-suite.mjs` 编排批次并输出逐模块结果。插件说明见 [agent-device-mcp](../environment/agent-device-mcp/README.md)，MCP 不决定产品 AC 语义。

新增真实设备流程读取 `environment/agent-device-mcp/README.md`，也可引用官方 agent-device skill。产品定制只写在对应模块测试脚本中。现有脚本的模拟范围和限制保留在模块 README，不把桌面移动视口当成 Android 真机覆盖。

原始脚本以场景级断言承接，详细诊断保留在 events.jsonl、trace、截图和 result.json。执行器不要求每个旧模块改用 OCR，也不伪造逐步骤证据。测试产物、登录态和凭据不得提交。
