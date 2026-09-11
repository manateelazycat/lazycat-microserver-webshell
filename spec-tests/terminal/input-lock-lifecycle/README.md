# 旧页面输入锁不得冻结共享终端

规格：[REQ](../../../spec/terminal/input-lock-lifecycle/REQ.md) · [AC](../../../spec/terminal/input-lock-lifecycle/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/input-lock-lifecycle`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：multi-device / lifecycle
- 真实依赖：真实 Provider、persistent agent、PTY、Unified WebSocket、两个浏览器 context
- 相关模块和源码入口：`runtime/static/app/server_revision/`、`runtime/static/app/agent_protocol_update/`、`runtime/static/terminal/input/`、`runtime/static/terminal/transport/`、`terminal_queue.go`、`agent.go`、`workspace.go`

## 触发条件

桌面页面和移动页面连接同一个真实 workspace pane。桌面页面模拟仍在运行的旧版前端，向自己的 logical stream 发送旧协议 `input_lock` 控制帧；移动页面随后向同一 PTY 输入唯一 marker 命令。

## 用户可见问题

修复前，桌面页面的 attach owner 会在 persistent agent 的 pane 上留下输入 blocker。移动页面虽然保持 `open`，输入仍会被服务端静默丢弃；刷新或重新打开页面无法删除旧 owner，只能等待旧 attach 清理。

## 预防的回归

- 任何页面发送旧 `input_lock` 都不得改变 pane 的输入能力。
- 一个页面的更新提示、退出或迟到控制帧不得冻结其他页面或设备。
- 旧协议控制帧在兼容期必须被 Provider 接受并忽略，不能触发 pane error 或 Unified 重连。
- 删除锁行为后，真实普通输入、PTY 回显和 Unified 单物理连接契约保持正常。

## 修复前基线

- 2026-09-04 使用当前工作区静态资源连接真实 `debug@cloud.lazycat.lightos.entry`，桌面和移动窗口共同连接测试 tab `tab-89` 的 `pane-115`。
- 运行命令：`HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/runtime/static" node spec-tests/run-playwright.mjs spec-tests/terminal/input-lock-lifecycle/test.mjs`。
- 桌面页成功发送旧 `input_lock: true`（stream `c1cd3727-475c-443d-a7d8-84627f6143e9`，channel generation 3）；移动页随后输入 marker，但 8 秒内真实 PTY 输出没有出现 marker，测试按预期失败。
- 失败产物：`artifacts/2026-09-04T06-57-35-757Z/`。`events.jsonl` 证明两个窗口的 Unified 连接仍持续收到 pong/输出，没有网络断开；桌面和移动失败截图均停留在同一 pane 的 shell prompt；`error.txt` 为 marker 等待超时，两个 trace 和 terminal timeline 已保存。

## 已确认根因

修复前根因是应用级更新弹窗状态被同步成 persistent agent 的 attach-scoped blocker，而 pane 写入使用“任一 owner 存在即阻塞全部普通输入”的全 pane 判定。新页面不能释放旧 attach owner，且被阻止的写入返回成功，浏览器没有错误信号。

## 实施方案

- 删除前端、Provider、agent 和 pane 中输入锁的实际状态及阻断行为。
- 不新增替代输入锁；更新弹窗只依赖遮罩和焦点，PTY 是否消费输入由终端程序负责。
- 在一个滚动升级兼容周期内，Provider 继续接受旧 `input_lock` 和 `terminal_input_blocked` 字段，但只执行无状态 no-op。
- agent 协议从 `lcmd-webshell-agent-v9` 提升到 `v10`；新 Provider 发现旧 agent 后通过现有应用内显式更新入口执行 scoped `replace-active`，无需重启应用服务。
- v9 被列为 attach-compatible；出现更新入口时原 pane 必须继续显示并可输入，不能黑屏、进入 required attach hold 或在用户确认前替换 agent。

修改文件：

- 前端输入和连接：`runtime/static/terminal/input/input_controller.js`、`runtime/static/terminal/session/session_state.js`、`runtime/static/terminal/transport/session_protocol_controller.js`、`runtime/static/global-runtime.js`。
- 更新事务：`runtime/static/app/server_revision/`、`runtime/static/app/bootstrap/bootstrap_controller.js`、`runtime/static/app/agent_protocol_update/agent_protocol_update_controller.js`。
- Provider/agent/PTY：`main.go`、`agent_runtime.go`、`terminal_queue.go`、`agent.go`、`workspace.go`。
- 测试与契约：`terminal_queue_test.go`、`workspace_test.go`、相关 `tests/*_test.mjs`、`runtime_shortcuts_test.go`、模块 README 和 `docs/ARCHITECTURE_AND_MODULE_MAP.md`。

## 验证预期

- 桌面和移动页面必须连接同一 pane。
- 桌面页发送旧 `input_lock: true` 后，移动页输入的唯一 marker 必须在 8 秒内从真实 PTY 输出中出现。
- 两个页面均保持一条 active Unified 物理 WebSocket。
- 首次从 v9 Provider/agent 升级到 v10 时，更新 notice 可以出现，但旧会话在确认前必须继续可见、可输入；取消确认后仍保持同一会话。
- console error、pageerror 和 API error 为零。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 \
WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/terminal/input-lock-lifecycle/test.mjs
```

目标实例和认证信息由 `spec-tests/.env` 或运行环境注入，不写入场景文件和产物摘要。

## 产物与失败诊断

运行产物写入 `spec-tests/terminal/input-lock-lifecycle/artifacts/<run-id>/`，包括桌面/移动截图、trace、JSONL 事件、错误摘要和 terminal timeline。失败时重点检查旧控制帧 identity、两个页面 pane ID、marker 是否出现在 PTY 输出，以及 WebSocket 是否发生 pane error 或重连。

## 验证结果

- 修复前真实基线按预期失败，产物为 `artifacts/2026-09-04T06-57-35-757Z/`。
- `go test . -run 'TestTerminalUnifiedInputLockIsCompatibilityNoop|TestTerminalControlInputLockIsCompatibilityNoop|TestHandleServerRevisionInputLockCompatibilityRequestIsNoop|TestHandleAgentAttachControlMessageInputLockIsCompatibilityNoop|TestHandleAgentAttachControlMessageForwardsInput|TestTerminalInputLockRemovalContract'`：通过。
- `node --test tests/*.mjs`：423 项全部通过，包括 IME 同步双击键盘、viewport input lock、普通输入、更新事务和连接协议测试。
- `spec-tests/terminal/input` 使用当前前端资源和真实 Provider/agent/PTY 通过，产物为 `../input/artifacts/2026-09-04T07-10-04-402Z/`。
- `spec-tests/terminal/viewport` 按其 README 注入 iPhone User-Agent 后通过，产物为 `../viewport/artifacts/2026-09-04T07-11-27-285Z/`；证明移动端 `inputViewportLock`、键盘展开/收起和几何恢复未被删除。
- `spec-tests/terminal/ime` 使用当前前端资源和真实终端链路通过，产物为 `../ime/artifacts/2026-09-04T07-14-05-758Z/`；同步双击 focus、composition、Backspace 和 paste 去重均通过。
- agent 协议已提升为 `lcmd-webshell-agent-v10`；协议更新、握手和 workspace mismatch 的 Go/Node 定向测试通过。测试明确固定 v9 为 `updateAvailable=true / updateRequired=false`，Queue ready 后 logical stream 仍可发送普通输入；兼容 notice 不会自动弹框。
- 提升协议版本后再次执行 `lzc-cli project release`，成功生成 39 MiB LPK；产物二进制确认包含 `lcmd-webshell-agent-v10`，前后端联合构建通过。
- 2026-09-04 用户反馈当前版本手动测试未遇到问题；该结果作为人工抽查记录，不替代修复后本场景的自动化运行。
- 本轮预检 `artifacts/2026-09-04T10-37-06-927Z/` 在旧 `input_lock` 已发送后 marker 超时。trace 显示 mobile 测试只 tap host，没有聚焦 helper textarea，因此没有可靠地产生用户输入；同期另一设备更高 resize epoch 的重复 ACK 被旧本地状态机再次处理，产生 `resize request or connection epoch mismatch` warning。两项分别由显式 textarea focus/单 input frame 断言，以及 resize duplicate remote ACK 幂等处理修复。
- 修正后独立通过，并在最终全量的 `artifacts/2026-09-04T11-16-28-879Z/` 再次通过：旧 `input_lock` 被无状态忽略，mobile 恰好发送 1 个 marker input frame 并收到真实 PTY 回显，两页各 1 条 active Unified socket，无 duplicate remote ACK mismatch。

## 已知限制

- 本场景通过真实 Unified WebSocket 发送旧版前端仍可能发送的兼容控制帧，不要求实际部署一个旧前端包。
- 本场景验证跨 attach 的用户可见结果；Provider no-op 的内部无状态性另由 Go 测试锁定。
- 测试目标必须运行已移除后端 blocker 的兼容 Provider/agent；若重新连接旧部署，本场景会按 marker 超时失败，不能用前端静态映射伪造通过。
- 当前完整 Node 437/437 和 `go test ./... -count=1` 均通过。
