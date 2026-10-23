# 终端键盘覆盖模块

## 职责

`key_overrides/` 负责 Ghostty 自定义键盘事件的边界转换：桌面 `Alt+可打印键` 的 ESC 前缀、`Shift+Tab` 的 backtab 序列，以及移动端 sticky modifier 文本输入。模块不拥有设置、输入队列、IME 或会话连接状态，所有跨模块动作都通过注入回调执行。

## 文件清单

- `index.js`：唯一公开入口。
- `key_overrides_controller.js`：键盘事件转换、session 绑定、迟到回调防护和销毁。

## 生命周期与 guard

每个 session 只安装一次 custom key handler；session cleanup 或模块 `dispose()` 后回调不得再向终端发送字节。`AltGraph`、非 ASCII 键和带 Ctrl/Meta 的组合不会误发 ESC 前缀。该模块只产生用户输入或快捷键字节，不触发 history replay、snapshot、resize 或重连中间画面。

`resolveKeyInput(session, event)` 注入工具专属键位适配；返回非空字节时经 `term.input(..., true)` 发送，避免后续默认编码重复发送。Codex Shift+Enter 的身份判断和编码由 `tui_adapters/codex/` 维护，本模块不识别进程或修改普通 Enter。
