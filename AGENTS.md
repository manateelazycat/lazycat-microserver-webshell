# AGENTS.md

## 代码边界

- `runtime/static/main.js` 只能作为前端启动入口。
- `runtime/static/global-runtime.js` 是 UI 全局运行时 owner；同级 `global-backend-worker.js` 是 Worker 全局运行时 owner。两者只编排各自模块和生命周期，具体实现分模块维护。
- 本项目禁止引入 `tmux`。
- 本项目禁止引入 `xterm.js`。
- 根目录 `main.go` 只组装依赖并分派启动；共用终端逻辑放在 `core/`，系统操作放在 `unix/` 或后续的 `windows/`，发现、鉴权、容器命令及 HTTP 接入放在 `provider/`。
- `core/` 不得导入平台包或 Provider，不得直接执行 `lightosctl`、调用 Unix PTY/syscall 或扫描 `/proc`；通过 `core/runtime.go` 的接口注入这些能力。
- `localserver/` 维护本地 HTTP 门禁和帧适配，复用 Core 的会话与 Unified 队列；`localtools/` 仅承载 PC 编码及 nano 兼容，不影响容器字节流。
- 每个服务端模块目录维护 `README.md`，说明职责、入口、依赖、关键约束和验证方式。模块边界或接口变化时同步更新。
- 修改服务端代码时，必须同步更新 `core/agent.go` 的 `AgentProtocolVersion`，并核对 `provider/agent_runtime.go` 的显式兼容列表和协议版本说明。

## 测试规则

- 测试以真实用户使用场景和可复现的真实故障场景为主，可以根据 spec-workflow skill 以及 Environment MCP 的构建规范，并使用已安装的 `agent-device-mcp` skill、注册的 MCP tools 和 `spec-tests/environment/webshell-test-harness` 项目适配新增真实测试模块。
- 不新增脱离真实产品行为链路的单元测试、Mock 测试或假数据验收测试。
- 每个任务完成后默认由开发者手工测试，除非开发者要求创建自动真机测试场景，否则不要编写任何多余的代码。

## 规格与执行器

- 产品需求和 AC 合同放在 `spec/`；测试实现和测试产物不放入规格正文。
- 测试实现和 Project AC Executor 在 `spec-tests/`，目录与 `spec/<domain>/<feature>/` 对齐。
- `spec-tests/environment/` 按环境插件分类维护 WebShell 的真实环境操作与观察服务，不属于场景测试模块；通用设备操作由独立安装的 `agent-device-mcp` skill/MCP 提供，WebShell 专属适配位于 `spec-tests/environment/webshell-test-harness/`。
- 自动测试必须使用当前工作树新构建的前端。执行入口自动构建并固定产物快照；本地资源缺失或源码在运行中变化时失败，禁止回退远端旧前端。
- 本项目对 `run-ac` 只暴露一个 Project AC Executor；测试项目通过稳定接口或 MCP 提供真实环境能力。
- AC 描述用户或调用方可观察的长期结果，不能把测试脚本或内部实现细节写成产品合同。
