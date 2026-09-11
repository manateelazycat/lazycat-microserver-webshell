# 测试环境组件

`environment/` 用于分类维护真实环境操作与观察能力。产品测试场景仍放在 `spec-tests/<domain>/<feature>/`。

## 通用 Agent Device MCP

[agent-device-mcp](agent-device-mcp/README.md) 是与产品无关的通用插件，独立维护在 [Gitee](https://gitee.com/linakesi/agent-device-mcp)。本仓库通过 Git submodule 固定版本；首次拉取后执行：

```sh
git submodule update --init --recursive
npm --prefix environment/agent-device-mcp ci
```

它只提供 agent-device 的 MCP 服务和 Node API，可以安装到任何项目，不读取 WebShell 配置，也不包含产品登录、构建或 AC 判定。

## WebShell 测试适配

[webshell-test-harness](webshell-test-harness/README.md) 由本项目维护，包含当前前端构建、Playwright 生命周期、WebShell 登录和实例选择、终端 OCR、Android 负载适配及测试证据处理。它调用通用 agent-device 插件，但不属于该插件。

这里不定义产品 REQ/AC。新增其他通用环境插件时建立同级目录；产品专属适配必须明确命名，不能写入通用插件仓库。
