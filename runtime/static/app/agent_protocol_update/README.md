# Agent 协议更新

## 职责与边界

本模块消费 Unified Queue 握手提供的当前/推荐 agent 协议版本，展示一次更新提示，在用户明确确认后调用 scoped agent 更新 API，并在成功后安排页面重载。

当前 Provider 推荐协议为 `lcmd-webshell-agent-v23`，修复清理终端行时误用全局列宽的问题，按所属页面的实际宽度清理 cells 及资源标志；前后端使用同一份新 WASM。保留 v22 的原生重排资源扩容修复，以及 v21 的窗口流控与按帧发布。v22 至 v9 仍显式兼容传输，兼容不代表旧 Agent 获得原生修复；新 WASM 指纹的状态基线恢复需要更新正在运行的 Agent。协议更新仍仅在用户确认后通过 scoped `replace-active` 执行，不能自动销毁现有 PTY。已有失败的 parser 不会因更新前端而恢复，本轮不包含 parser 自动重建。v18 的关闭生命周期修复与 v17 的完整状态基线保留；Kitty 图形会话沿用原路径。

本模块不拥有终端 session、连接、PTY 或输入状态，不创建本地或远程输入锁。确认更新后允许清理当前页面尚未发送的 pending 输入，避免即将销毁的旧会话残留队列，但不得在 Provider、persistent agent 或 pane 上保存 blocker。

## 公开入口与状态所有权

外部只能从 `app/agent_protocol_update/index.js` 导入：

- `createAgentProtocolUpdateController()`：target、协议版本、提示、确认、更新中和重载状态的唯一 owner。
- `createAgentProtocolUpdateAPI()`：协议更新 HTTP 请求。
- `createAgentProtocolUpdateView()`：右上角更新提示的 DOM adapter。

controller 独占 `targetName`、当前/推荐版本、`updateAvailable`、`updateRequired`、`dialogOpen`、`updating`、`reloadPending` 和 reload timer。其他模块只能通过 `beginTarget()`、`observe()`、`showUpdateDialog()`、`snapshot()` 和 `dispose()` 交互。

## 生命周期

同一 target/版本不重复弹出 required 提示。兼容版本只显示可点击 notice，不自动打开确认框、不暂停 attach，也不改变旧会话画面和输入；用户取消不改变连接或输入。更新失败恢复提示；更新成功后隐藏提示并安排一次重载。`dispose()` 清理 view 和 reload timer，拒绝迟到回调，不向终端发送控制帧。

## 文件清单

- `index.js`：单一公开入口。
- `agent_protocol_update_controller.js`：版本状态、确认、更新和重载编排。
- `agent_protocol_update_api.js`：scoped HTTP API。
- `agent_protocol_update_view.js`：提示 DOM 和 click listener。

## 依赖与验证

依赖方向为 `global-runtime -> agent_protocol_update -> API/view`。行为测试为 `tests/agent_protocol_update_controller_test.mjs`，真实旧控制帧兼容和跨页面输入隔离由 `spec-tests/terminal/input-lock-lifecycle` 覆盖。最小回归需确认取消、失败、成功重载、required 自动提示和页面销毁均不会创建 `input_lock` 控制帧或影响其他设备输入。

确认更新后调用 `prepareUpdate()`，复用页面完整销毁编排退休旧会话、Worker、尺寸、恢复与 workspace 任务，等待旧物理连接关闭后再发更新请求。仅保留更新 controller、诊断及反馈以处理结果；成功或失败后均重新加载，不能恢复已销毁的旧运行时。Provider 按 selector/account 对自动 ensure 和显式替换做生命周期互斥。

v21 增加 Provider 的窗口消费协议（1 MiB／256 个轮次），保留旧逐轮协议；前端解析与画面生成分离，增加同步绘制保护。继续显式兼容 v20 至 v9，WASM 与 checkpoint ABI 沿用 v20，本轮未修改原生 resize。新消费协议由 Provider 执行，不要求自动替换仍在运行的旧 Agent。
