# TUI 通用触摸逻辑

本模块只提供不含任何工具名称或身份判断的触摸手势状态机和 DOM adapter。外部通过 `common/index.js` 导入；工具模块负责提供 `shouldStart` 和动作依赖。

`fullscreen_tui_touch.js` 持有单手势 phase、坐标和 wheel remainder；`fullscreen_tui_touch_adapter.js` 持有 long-press timer、selection auto-scroll 和 listener cleanup。`touchend` 在 IME `shouldPreserveTouchDefault(event)` 为真时不得 `preventDefault`，也不得 `sendClick`。取消、touchcancel 和 session dispose 必须清空全部资源。相关 guard 由 opencode/herdr/pi/Claude/Grok 行为测试共同覆盖。

`fullscreen_tui_context_menu_adapter.js` 和 `fullscreen_tui_desktop_selection_adapter.js` 维护右键及桌面拖选的公共事件机械逻辑。工具身份和适用条件由调用方注入，公共 adapter 只认领终端鼠标事件，不决定哪些程序可使用 WebShell 菜单和选区。Claude、Grok、Codex、opencode 分别在自己的目录维护候选判定与公开 adapter。
