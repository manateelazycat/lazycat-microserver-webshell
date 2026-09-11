# Server Revision

## 职责

本模块维护页面与 Provider 的服务版本协商和部署后重载流程：稳定 client ID、版本读取、首次延迟检查、重载提示以及确认后的 tab 恢复信息。

本模块不负责 WebSocket、终端输入、工作区状态、对话框 DOM、Service Worker 更新或历史恢复。它只通过显式依赖调用对话框和恢复入口；任何版本检查和重载提示都不得锁定或清空终端输入，也不得触发、清空或展示终端历史回放过程。

## 公开入口与状态所有权

外部只能从 `app/server_revision/index.js` 导入：

- `createServerRevisionController()`：版本状态与重载事务的唯一 owner。
- `createServerRevisionAPI()`：`/api/server-revision` 请求和 URL 契约。
- `createServerRevisionLifecycle()`：首次检查 timer 的唯一 owner。

controller 独占 client ID、当前 revision、reload prompted、dialog open、dispose generation；调用方只能通过 `getClientID()`、`isDialogOpen()`、`observe()`、`refresh()`、`scheduleInitialCheck()` 和 `dispose()` 交互。

## 生命周期

首次版本检查最多安排一次。`dispose()` 会取消 timer、推进 generation 并拒绝迟到 fetch/dialog 结果。重载确认只有在当前 controller generation 仍有效时才可写入恢复 tab 和调用 `location.reload()`；取消提示不改变任何终端输入状态。

## 文件清单

- `index.js`：单一公开入口。
- `server_revision_controller.js`：client ID、revision 状态和重载事务编排。
- `server_revision_api.js`：Provider URL和版本读取。
- `server_revision_lifecycle.js`：首次检查 timer 和销毁。

## 验证

- 行为测试：`app_server_revision_controller_test.mjs`。
- 静态边界：`TestRuntimeAppServerRevisionModuleBoundary`。
- 最小回归：正常页面等待首次版本检查；模拟 revision 变化后取消提示，确认输入不受影响；再次部署后确认重载会恢复原 tab；离线或销毁期间不得出现迟到提示。旧页面发送的 `terminal_input_blocked` 仅由 Provider 兼容入口无状态忽略，真实跨页面输入回归见 `spec-tests/terminal/input-lock-lifecycle`。
