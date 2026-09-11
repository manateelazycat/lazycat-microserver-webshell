# 测试环境插件

`environment/` 用于按插件分类维护测试环境的准备、操作和观察能力。每种环境实现放在独立子目录中，测试场景仍放在 `spec-tests/<domain>/<feature>/`。

当前只有 [agent-device-mcp](agent-device-mcp/README.md) 插件。它独立维护在 [Gitee](https://gitee.com/linakesi/agent-device-mcp)，本仓库通过 Git submodule 固定版本；首次拉取后执行 `git submodule update --init --recursive`。插件提供 agent-device 设备控制、MCP 服务、现有 Playwright 测试环境、当前前端构建和外部结果观察能力。

这里不定义产品 REQ/AC，也不放产品测试场景。新增其他测试环境时，在 `environment/` 下建立新的同级插件目录，并由 Project AC Executor 或对应测试脚本调用。
