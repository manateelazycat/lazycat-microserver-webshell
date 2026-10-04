# Service Forwarding 模块

## 职责

本目录负责 WebShell 设置中的服务转发：读取当前账号可见的发布记录、按当前实例过滤、展示服务状态、编辑上游 HTTP/HTTPS 地址、创建或更新发布记录、安装应用入口以及删除服务。

物理机目标沿用 `client:<id>`，与容器目标共享列表和编辑器，支持发布该物理机可达的 HTTP/HTTPS 主机名或 IP 地址。目标服务自行处理应用层鉴权；选择跳过 LightOS 登录保护时先显示公开风险确认。设备在线/代次验证及字节通道由 Provider、LightOS 管理端和物理机本地服务分别负责。本模块不直接连接物理机 IP，也不打开局域网端口。

本模块不负责实例权限判定、LightOS Admin 私有状态、终端连接、工作区、历史、渲染或设置面板整体导航。账号和实例所有权仍由 Provider 与 LightOS Admin 服务端校验；浏览器只调用 Provider 暴露的白名单 `/api/publish/*` 路由。

## 公开入口

外部只能从 `index.js` 导入 `createServiceForwardingController()`。控制器公开 `start()`、`dispose()`、`setSelected()`、`handleTargetChange()`、`refresh()`、`render()`、`closeEditor()`、`handleEscape()`、`isEditorOpen()` 和只读 `snapshot()`。

`global-runtime.js` 只负责在设置 tab、实例目标和全局 Escape 顺序变化时调用这些公开方法，不得深度导入内部文件或直接修改服务转发状态。

## 状态所有权

`service_forwarding_controller.js` 是以下状态的唯一 owner：

- 当前目标实例快照和目标切换 generation。
- 当前实例的服务转发列表。
- 当前编辑记录 ID、编辑器开关和延迟 focus generation。
- busy 状态、列表刷新 generation 和部署/删除 operation generation。

View 只读写 DOM，API 只执行 HTTP 请求，lifecycle 只注册和移除事件。其他模块通过目标 getter、反馈回调、确认对话框和打开 URL 命令交互，不得直接修改 entries 或 editing state。

## 生命周期

- `start()` 幂等注册模块内事件并渲染当前目标的空状态。
- `setSelected(true)` 在服务转发设置页进入活动状态时刷新列表；离开或关闭设置页会使迟到刷新结果失效。
- `handleTargetChange()` 清理旧实例列表和编辑器，使旧目标的 Promise 无法覆盖新目标 UI，并在当前页面仍选中时重新加载。
- `dispose()` 幂等移除全部 listener、取消 focus timer、递增请求 generation 并清空模块状态。
- 新建记录在安装应用入口失败或目标切换导致事务失效时会尽力删除刚创建的发布记录，避免留下未完成记录。

## 文件清单

- `index.js`：模块唯一公开入口。
- `service_forwarding_controller.js`：状态 owner、刷新、部署、删除和跨层编排。
- `service_forwarding_api.js`：Provider `/api/publish/*` 白名单请求及错误解析。
- `service_forwarding_model.js`：发布记录、目标、上游 URL、子域名和表单数据的纯校验与转换。
- `service_forwarding_view.js`：列表、状态、编辑器、表单和 busy 控件的 DOM 适配。
- `service_forwarding_lifecycle.js`：模块内 click、input 和 submit listener 的注册与清理。

## 依赖方向

`global-runtime.js -> service_forwarding/index.js -> service_forwarding_controller.js`。Controller 可以依赖本目录 API、model、view 和 lifecycle；内部文件不得反向导入 `global-runtime.js`、设置实现、实例 loader 或终端模块。

目标实例通过 `getTarget()` 只读回调进入模块。服务转发 API 必须继续请求当前 Provider 的白名单路由，不能从浏览器直接访问 LightOS Admin，也不能接收或保存服务凭据。

## 测试与回归

- `service_forwarding_controller_test.mjs`：目标过滤、迟到刷新、生命周期清理、表单部署、失败回滚、删除确认和 dispose guard。
- `runtime_shortcuts_test.go`：公开入口、README、`global-runtime.js` 边界、版本化静态资源和旧实现移除契约。
- `workspace_test.go`：Provider 发布代理的账号、实例所有权、路由白名单、multipart 和错误响应测试。

最小回归步骤：打开设置中的服务转发页；验证列表只显示当前实例；新建 HTTP 和 HTTPS 服务；编辑上游地址；带 PNG 图标部署；取消和确认删除；在列表加载或部署过程中切换实例并确认旧响应不覆盖新实例；关闭设置和离开页面后确认事件与 timer 已清理。
