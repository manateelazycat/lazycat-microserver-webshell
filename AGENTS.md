# AGENTS.md

## 代码边界

- `runtime/static/main.js` 只能作为前端启动入口。
- `runtime/static/global-runtime.js` 是应用根目录下唯一的全局运行时 owner。
- 本项目禁止引入 `tmux`。
- 本项目禁止引入 `xterm.js`。

## 测试规则

- 测试以真实用户使用场景和可复现的真实故障场景为主，可以根据 spec-workflow skill 以及 spec-workflow 和 Environment MCP 的构建规范，并使用 agent-device skill、`spec-tests/environment/agent-device-mcp` 通用能力和 `spec-tests/environment/webshell-test-harness` 项目适配新增真实测试模块。
- 不新增脱离真实产品行为链路的单元测试、Mock 测试或假数据验收测试。

## 规格与执行器

- 产品需求和 AC 合同放在 `spec/`；测试实现和测试产物不放入规格正文。
- 测试实现和 Project AC Executor 在 `spec-tests/`，目录与 `spec/<domain>/<feature>/` 对齐。
- `spec-tests/environment/` 按环境插件分类维护真实环境操作与观察服务，不属于场景测试模块；`spec-tests/environment/agent-device-mcp/` 是通用外部插件，WebShell 专属适配位于 `spec-tests/environment/webshell-test-harness/`。
- 自动测试必须使用当前工作树新构建的前端。执行入口自动构建并固定产物快照；本地资源缺失或源码在运行中变化时失败，禁止回退远端旧前端。
- 本项目对 `run-ac` 只暴露一个 Project AC Executor；测试项目通过稳定接口或 MCP 提供真实环境能力。
- AC 描述用户或调用方可观察的长期结果，不能把测试脚本或内部实现细节写成产品合同。
