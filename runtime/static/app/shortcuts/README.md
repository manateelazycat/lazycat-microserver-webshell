# 应用快捷键模块

## 职责

`app/shortcuts/` 负责桌面快捷键的过滤、动作映射和全屏命令协调。它只把用户意图转成注入的显式命令，不拥有 tab、pane、设置、附件、终端输入或工作区状态。

模块不注册页面级 `keydown` listener；listener 由 `app/app_lifecycle.js` 持有并调用公开的 `handleKeydown()`。快捷键路径不得建立 WebSocket、执行历史回放、修改 Canvas 或显示 replay/snapshot/resize/重连中间帧。

## 公开入口

外部只能从 `app/shortcuts/index.js` 导入：

- `createAppShortcutController(options)`：创建快捷键 controller。
- `createAppShortcutLifecycle()`：创建命令生命周期 fence。

controller 公开 `runAction()`、`handleKeydown()`、`toggleFullscreen()`、`isInteractiveShortcutTarget()`、`isDisposed()` 和幂等 `dispose()`。

## 状态与生命周期

- `shortcut_controller.js` 只持有无业务状态的动作路由和快捷键处理逻辑；所有跨模块行为通过回调注入。
- `shortcut_lifecycle.js` 持有 disposed/generation fence，拒绝页面销毁后的迟到命令。
- 页面 listener、定时器和其他资源仍由 `app_lifecycle.js` 或对应业务模块清理。

Ctrl+V / Command+V 只聚焦终端并保留浏览器默认粘贴，由原生 paste 事件消费图片或文本，避免重复读取和上传。Ctrl+Shift+V、Shift+Insert、自定义粘贴快捷键和显式 `runAction("paste_terminal")` 调用注入的 `pasteTerminal`，与右键菜单共用图片优先的主动剪贴板读取，避免浏览器的纯文本粘贴命令丢弃图片。

## 文件清单与验证

- `index.js`：唯一公开入口。
- `shortcut_controller.js`：快捷键过滤、动作映射、全屏和粘贴路径；普通表单目标保持浏览器默认行为，附件隐藏 file input 仅在原生粘贴快捷键下通过注入谓词重定向到终端输入目标。
- `shortcut_lifecycle.js`：命令生命周期 fence。
- `app_shortcut_controller_test.mjs`：动作分派、普通交互目标隔离、附件 file input 原生粘贴重定向、Shift+Insert 和 dispose 行为测试。

相关 guard 位于 `runtime_shortcuts_test.go`；最小回归为 `node --test tests/app_shortcut_controller_test.mjs`，并检查桌面快捷键不触碰终端历史或额外连接。
