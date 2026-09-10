# 终端策略模块

## 职责

`policy/` 维护终端交互所需的无状态识别和小范围策略：Grok/Claude fullscreen 会话候选适配、终端位置描述，以及用户输入前滚到底部并清理旧滚动动画。精确 Grok 身份判断由 `terminal/tui_adapters/grok/` 拥有，本模块只转出并组合 mouse tracking / 布局参数。它不创建或关闭 WebSocket，不拥有 session、history、resize、presentation 或输入队列状态。

## 公开入口

外部只能从 `index.js` 导入。`createTerminalPolicyController()` 提供 Claude/Grok 事件候选、输入前滚动和幂等 `dispose()`；命令 token 解析通过同一公开入口导出，Grok 可执行文件和官方入口判断转出自 `tui_adapters/grok`。

## 状态所有权

controller 只持有模块级 `disposed` fence。session、mouse tracking、dialog、touch layout 和 renderer viewport 状态由调用方持有，策略只能通过注入的只读 getter/命令访问；模块不写入共享全局对象。

## 生命周期

策略 controller 创建后可重复查询；`dispose()` 幂等，调用后滚动命令立即拒绝。滚动只取消当前 session 的动画并调用注入 renderer，不注册 timer、observer、listener 或 socket，也不接受迟到异步任务。

## 文件清单

- `index.js`：唯一公开入口，转出 controller 和纯函数。
- `policy_controller.js`：命令 token 解析、Claude/Grok TUI 候选适配、滚动策略与 dispose fence。

## 依赖方向

`global-runtime.js` 通过公开 API 注入 dialog、mouse、layout 和 renderer 查询；policy 可依赖 `terminal/tui_adapters` 的候选判定，但不反向依赖 app、workspace、transport、history、resize 或 presentation 的实现。

## 测试与回归

行为测试为 `terminal_policy_controller_test.mjs`，静态边界和版本化静态资源契约位于 `runtime_shortcuts_test.go`。最小回归：运行 `node --test tests/terminal_policy_controller_test.mjs` 和对应 Go runtime guard，确认精确入口匹配、Claude 参数、底部滚动及 dispose 门禁均通过。

## 不可破坏边界

身份判断必须使用精确 executable/官方入口匹配，不能使用宽泛子串；关闭 session、对话框打开或模块 dispose 后不得滚动或修改终端。任何策略路径都不得触发或显示 history replay、snapshot、resize 或重连中间帧。
