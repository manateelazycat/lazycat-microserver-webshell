# opencode Fullscreen 适配

本模块负责精确 opencode 身份判断、fullscreen 触摸和桌面鼠标事件适配。触摸滚动与选择沿用原有公共 adapter；桌面拖选和右键由 WebShell 本地选区及菜单处理，普通左键点击仍传给 opencode，滚轮继续走通用鼠标协议。通用事件机械逻辑来自 `../common/index.js`。外部通过 `opencode/index.js` 导入；listener、timer 和手势状态由通用 adapter 的 cleanup 随 session 销毁。

文件为 `opencode_fullscreen_touch.js`、`opencode_fullscreen_touch_adapter.js`、`opencode_fullscreen_context_menu_adapter.js` 和 `opencode_fullscreen_desktop_selection_adapter.js`。相关 guard 位于 `opencode_herdr_fullscreen_touch_test.go`；必须同时验证 herdr、Claude 和普通终端不被误匹配。按 `spec/terminal/opencode-desktop-interaction/` 在真实 opencode 会话手工验收桌面拖选复制、右键菜单、普通点击与滚动，并检查移动端触控仍正常。
