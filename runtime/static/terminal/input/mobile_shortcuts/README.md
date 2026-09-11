# 移动终端快捷键模块

## 职责

`mobile_shortcuts/` 负责终端底部快捷键栏的状态、按钮渲染、触摸/指针交互、长按重复输入、sticky modifier、触感反馈和键盘保活。快捷键动作通过显式回调交给 workspace、terminal、settings、selection、clipboard 和 attachment 模块执行。

本模块不拥有 tab/pane/session、输入队列、IME composition、transport、history、resize、rendering 或业务设置值，也不创建 WebSocket，不执行历史回放，不显示 replay、snapshot、resize 或重连中间过程。

## 公开入口

外部只能从 `terminal/input/index.js` 或本目录 `index.js` 导入：

- `createMobileShortcutsController(options)`：创建快捷键 controller，提供 `render()`、`syncState()`、`trigger()`、sticky 输入查询/消费、反馈开关和 `dispose()`。
- `createMobileShortcutsLifecycle(options)`：跟踪快捷键按钮 listener、重复 timer 和重渲染资源。

`onAction(action, session, context)` 是唯一业务动作出口；`sendInput(session, data)` 是唯一输入出口。controller 只发布用户意图，不直接修改外部状态。

## 状态与生命周期

controller 独占 sticky modifier、触感反馈偏好、按钮交互状态和渲染 generation；lifecycle 独占动态按钮 listener、重复 timeout/interval。每次 `render()` 先撤销上一批按钮资源；`dispose()` 幂等并使迟到 timer/事件失效。快捷栏通过 `shouldPreserveInputFocus()` 保持当前输入，不维护额外的聚焦许可时限，也不将 DOM 焦点视为系统键盘显示证据。

## 文件清单

- `index.js`：本目录唯一公开入口。
- `mobile_shortcuts_controller.js`：快捷键状态、动作分派、DOM 渲染及触摸/长按交互。
- `mobile_shortcuts_lifecycle.js`：listener、timeout、interval 的注册、重置和销毁。

## 依赖与验证

依赖方向为 app/settings -> mobile shortcuts -> input/IME 的显式回调；模块不得深度导入 workspace、transport、history 或 rendering。相关测试包括 `terminal_mobile_shortcuts_controller_test.mjs`、`TestTerminalMobileShortcutsModuleBoundary` 以及 `spec-tests/terminal/input`、`spec-tests/terminal/ime` 的真实输入回归。
