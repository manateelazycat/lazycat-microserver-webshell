# 测试环境组件

`spec-tests/environment/` 用于维护 WebShell 自身的真实环境操作与观察适配，与 `spec-tests/<domain>/<feature>/` 下的产品测试场景分离。

## 通用设备 Skill 与 MCP

真机、模拟器和浏览器会话的通用操作由独立仓库 `agent-device-mcp` 提供。它基于 `agent-device`，通过 skill 约束 Agent 的设备选择、会话生命周期和清理方式，并通过 MCP tools 提供结构化设备操作。

首次安装 skill：

```sh
npx skills add git@gitee.com:linakesi/agent-device-mcp.git
```

更新 skill：

```sh
npx skills update agent-device-mcp
```

仓库当前需要认证，安装前通过 `ssh -T git@gitee.com` 检查 Gitee SSH key。也可以使用 `npx skills update` 更新当前作用域中的全部 skills。MCP 服务按该 skill 的说明独立注册，不把 MCP checkout、绝对路径或个人配置提交到 WebShell 仓库。

Agent 执行交互式设备操作时先加载 `agent-device-mcp` skill，再调用已注册的 MCP tools。WebShell 自动测试脚本使用 `spec-tests/package.json` 中固定版本的 `agent-device` npm 依赖，不依赖外部仓库目录。

## WebShell 测试适配

[webshell-test-harness](webshell-test-harness/README.md) 由本项目维护，包含当前前端构建、Playwright 生命周期、WebShell 登录和实例选择、终端 OCR、Android 负载适配及测试证据处理。它可以调用通用设备能力，但不属于通用 MCP/skill。

这里不定义产品 REQ/AC。新增 WebShell 环境适配时建立明确命名的目录；通用设备管理能力维护在独立仓库中，不能混入产品专属逻辑。
