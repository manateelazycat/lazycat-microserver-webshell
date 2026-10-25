# 实例模块

## 职责

`instances/` 负责浏览器侧的实例发现、实例列表快照、实例切换器 DOM、首页地址加载与缓存、实例相关 URL 导航，以及本模块 listener 和异步请求的生命周期。

本模块不负责实例可见性和账号授权判断。`/api/instances` 的结果由 Provider 和 LightOS Admin 权威提供，浏览器不得推断、补全或缓存额外实例，也不得直接访问 Admin 或客户端服务凭据。

本模块不负责工作区重置、tab/pane、终端 session、WebSocket、历史、缓存、resize、输入或 Canvas presentation。当前活动 selector 和 generation 由 `workspace/target_controller.js` 持有；用户选择实例后，controller 只通过 `onSwitchTarget(nextName, options)` 发出命令，由 target controller 完成目标切换编排。

## 公开入口与契约

外部只能从 `instances/index.js` 导入：

- `createInstancesController(options)`：创建唯一 controller。
- `createInstancesLoader(options)`：实例列表加载器，主要供行为测试和底层复用。
- `instanceSelector()`、`instanceDisplayName()`、`isClientInstanceName()`、`isRunningInstance()`、`readInstanceTargetName()`：无状态 model helper。

Controller 的主要公开 API：

- `start()` / `dispose()`：幂等启动和销毁模块。
- `load()` / `refresh()` / `loadDefaultName()`：加载列表、校验当前目标和选择默认运行实例。
- `openSwitcher()` / `closeSwitcher()` / `isSwitcherOpen()`：管理切换器。
- `switchTo()`：向外部发出实例切换命令，不直接修改工作区或终端。
- `handleActiveTargetChange()`：外部活动 selector 变化后同步只读选中态。
- `getActiveInstance()` / `getActiveDisplayName()` / `snapshot()`：返回副本或只读快照。
- `navigateHome()`：加载 Provider 提供的 LightOS 首页地址并执行导航。

`onSwitchTarget` 必须在返回 Promise 前同步提交新的活动 selector；耗时的工作区刷新可以继续异步完成。模块会在命令发出后立即重绘选中态，但不会读取或修改工作区内部对象。

## 状态所有权

`instances_controller.js` 是以下状态的唯一 owner：

- 当前实例列表 snapshot。
- 切换器打开 generation、反馈和列表渲染时机。
- loader、navigation、lifecycle 和 dispose 状态。

`instances_loader.js` 独占 `/api/instances` 的 in-flight Promise、重试 generation 和 AbortController。`instances_navigation.js` 独占 LightOS 首页 URL cache、in-flight Promise、generation 和 AbortController。活动 selector、工作区 generation 和 tab/pane registry 不属于本模块。

## 生命周期与清理

`start()` 只注册一次切换按钮、列表、首页、外部点击、Escape 和 `popstate` listener。`dispose()` 会：

- 移除所有模块 listener。
- abort 实例列表和首页地址请求。
- 递增 generation，拒绝迟到结果和迟到反馈。
- 关闭切换器、清空反馈和列表，并恢复首页按钮状态。

网络错误及 502/503/504 按 `250ms、750ms、1500ms、3000ms` 重试；401/403 等授权错误和 JSON 解码错误不重试。并发列表加载必须共享同一个 in-flight Promise，最终错误必须保留 Provider 阶段详情。

## 文件清单

- `index.js`：唯一公开入口。
- `instances_controller.js`：模块状态、命令编排、generation 和公开 API。
- `instances_loader.js`：`/api/instances` 单飞加载、有限重试和取消。
- `instances_model.js`：selector、显示名、运行状态和 URL 参数纯函数。
- `instances_view.js`：切换器和首页按钮 DOM 适配。
- `instances_lifecycle.js`：模块 listener 的注册与移除。
- `instances_navigation.js`：LightOS 首页 URL 校验、缓存、偏好参数和请求取消。

## 依赖方向与回归

模块只依赖浏览器标准 API 和自身文件。外部通过回调提供活动 selector、URL 更新、工作区切换命令、弹层互斥、首页导航提交/回滚和 toast；模块不得反向导入 diagnostics、devices、settings、workspace 或 terminal 实现。

相关 guard：

- `instances_loader_test.mjs` 覆盖退避、单飞、授权错误、Provider 详情、无效 JSON 和 dispose。
- `instances_controller_test.mjs` 覆盖列表 owner、切换命令、默认/回退目标、首页导航、listener 和迟到结果清理。
- `TestRuntimeInstancesModuleBoundary` 固定公开入口、README、版本化静态资源、`global-runtime.js` 集成和旧实现删除。
- `instances_test.go` 与 `workspace_test.go` 继续保护服务端实例可见性、账号隔离和 Provider/Admin 边界。

最小回归：打开切换器并确认运行/停止实例状态；切换实例后确认 URL、工作区和选中态一致；模拟 `/api/instances` 502 后恢复及 401 不重试；返回首页时确认移动远程桌面偏好参数；销毁页面后确认无残留请求或 listener。任何验证都不得触发或展示终端历史回放过程。

移动布局下右上角菜单的高度由 CSS 按动态视口扣除顶部安全区、按钮锚点及底部快捷键栏/停靠偏移计算；快捷键为空时只保留实际底部停靠偏移。菜单整体负责纵向滚动，实例列表不另设高度限制或嵌套滚动区域，避免小屏横屏时内容落到快捷键栏后面。强制 PC 模式沿用桌面菜单样式。手工验证小屏横屏及菜单打开期间的横竖屏切换、长实例列表、空快捷键栏，确认最后一项可滚动到快捷键栏上方并正常选择。产品口径见 `spec/app/instance-switcher-viewport/`。
