# 应用 Bootstrap

## 职责与边界

本目录负责应用启动事务：启动 feature controller，并行等待 Ghostty、主题、设置和实例列表，执行首次 workspace 请求/apply/retry 分流，以及启动失败时的错误终端呈现。

在首次 workspace 请求发起前，通过注入的 `prepareTransport(context)` 为已确定的普通容器目标启动空订阅物理连接准备；不 await 连接，不延迟并行的前端加载。实际 socket 仍由 transport owner 管理，bootstrap 只持有取消回调。启动失败、workspace 失败或为空、销毁时取消未使用的预连接；目标变化由 target owner 通知 transport 关闭旧连接。初始化失败或销毁后，迟到的实例列表结果不得重新启动 workspace 请求或预连接。成功应用非空工作区后，由既有 pane membership 接管连接生命周期。

本模块不负责终端连接、历史回放、Canvas、resize、输入或 workspace 数据模型，也不申请浏览器持久存储、不从页面注册 Service Worker。目录内的退役 Worker 仅由 Provider 在历史 `/service-worker.js` URL 提供，用于移除旧 registration；`index.html` 的前置触发器只调用现有 registration 的 `update()`，不属于应用运行时入口。任何终端历史、snapshot、resize 或重连中间过程都不得显示。

## 公开入口与状态所有权

外部只能从 `app/bootstrap/index.js` 导入：

- `createAppBootstrapController()`：启动事务和失败处理的唯一 owner。
- `createAppBootstrapLifecycle()`：started/disposed/generation 的唯一 owner。
- `createLegacyWebShellStorageCleanupController()`：迁移期一次性注销本 WebShell 旧 Service Worker，并删除已知旧 app-shell/terminal Cache API 记录。

旧存储清理器不读取终端数据、不参与启动呈现，也不创建新缓存。其 `cleanup()` 和全部 `dispose()` 都必须幂等，并拒绝销毁后的迟到操作。

退役 Worker 只处理已存在 registration 的升级：`index.html` 在任何版本化资源之前检查当前页面是否已有 controller，仅在受控时对同 scope registration 调用 `update()`；install 立即 `skipWaiting()`，activate 获取当前受控窗口、删除已知 WebShell Cache、注销自身并导航这些窗口一次。前置触发器不得注册 Worker、打开缓存或直接 reload；退役 Worker 不得注册 fetch listener、打开或写入缓存、调用 `clients.claim()`、接管未受控页面或恢复 PWA/offline 行为。

## 文件清单

- `index.js`：唯一公开入口。
- `bootstrap_controller.js`：启动、首次 workspace 分流、activity 启动和失败终端编排。
- `bootstrap_lifecycle.js`：单次启动、generation 和 dispose fence。
- `legacy_storage_cleanup_controller.js`：精确匹配旧 Worker URL 和已知缓存名的一次性清理。
- `legacy_service_worker_retirement.js`：由 Provider 在旧 Worker URL 提供的无缓存退役脚本；删除已知旧缓存、注销 registration 并一次性重载受控窗口。

## 依赖与验证

依赖由 `global-runtime.js` 注入，不直接导入业务模块。行为测试为 `app_bootstrap_controller_test.mjs`、`legacy_storage_cleanup_controller_test.mjs` 和 `legacy_service_worker_retirement_test.mjs`，Provider 响应由 `TestLegacyServiceWorkerRetirementHandler` 固定，HTML 触发顺序由 `TestHandleIndexForcesLegacyWorkerUpdateBeforeAssets` 固定，静态边界由 `TestRuntimeSnapshotOnlyAndPWARemovalContract` 和 bootstrap/runtime guard 覆盖。

最小回归包括首次进入、无预选 target、settings/workspace 失败、启动期间切换 target、Ghostty 失败、存在旧 Worker/缓存和无旧状态场景；确认不会重复启动、迟到 apply、误删其他应用缓存或显示历史中间帧。Worker 升级还必须使用允许 Service Worker 的真实浏览器上下文，通过生产 HTML 前置脚本而不是测试代码直接更新 registration，确认旧受控页面只额外导航一次、registration/已知缓存被移除，干净用户不请求 Worker 且不发生额外导航。
