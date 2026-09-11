# 工作区模块

## 职责与边界

当前目录维护 workspace API、恢复与活动 tab 持久化、refresh/retry、权威 state apply、布局、tab registry、标签标题/inline rename、页面与移动端标题、通知状态、tab 导航、tab/pane CRUD、tab DOM、activity、tab 激活编排和 pane 激活编排。workspace API 负责 Provider 边界，并把 workspace 在 Queue 建立前返回的结构化协议 mismatch 交给全局 Agent 更新 controller；该状态必须暂停 refresh retry 和 activity，等待用户显式确认更新。persistence 负责 URL/storage；refresh 负责 request/apply 请求阶段与退避；state apply controller 负责把已确认的权威 tab/pane snapshot 映射到现有 registry；presentation controller 负责 tab 自动标题、通知、空状态和 cursor blink；tab controller 负责本地权威 apply 与用户远端命令之间的 CRUD 边界；tab activation controller 负责保帧、视觉提交、active pane、当前设备尺寸接管、membership 与持久化的分阶段顺序；pane activation controller 负责单个 pane 的 active DOM、明确用户交互 claim、连接优先级、focus 和远端持久化顺序。它们只通过注入命令调用 session/resize/transport，不直接实现终端连接、历史或渲染算法。

目标 controller 负责当前实例 selector、generation 及实例切换事务；它不拥有实例列表或终端资源。

## 公开入口与状态

外部只能从 `workspace/index.js` 导入公开工厂。workspace API 绑定 selector/generation；persistence 持有 suppression/Promise chain；refresh 持有 recovery metrics 与 retry lifecycle；state apply controller 唯一持有 `applying` 状态，state apply lifecycle 独占 apply 后的 RAF；tab registry 唯一持有 tab Map、ID 序列和 active tab；tab navigation 唯一持有最近两个 tab；tab controller 唯一编排 tab/pane CRUD；tab view 唯一创建、排序和切换 tab DOM；tab activation controller 唯一编排激活流程，activation scheduler 独占 latest-only frame/timer；tab lifecycle 唯一持有 tab context cleanup 与延迟 RAF。其他 controller 各自持有布局、标签和 activity 状态。所有 `dispose()` 都是幂等的，迟到请求、重试、apply RAF、激活阶段、持久化和 UI 回调必须通过 generation、identity 或 disposed 检查拒绝。

target lifecycle 唯一持有 active selector、generation 和 disposed 状态；target controller 唯一编排目标变更后的缓存/网络/业务模块通知、workspace reset、URL 更新和 refresh。

## 跨设备成员同步契约

跨设备新建/关闭标签通过既有 activity 响应发现：activity owner 比较完整 pane ID 集合，只在新增/消失时调用 refresh owner 的 `syncMembership()` 按需获取完整 workspace。默认仍只有原来的 4 秒 activity interval，没有新增 WS、interval 或成员同步重试 timer。错误/缺失/重复 ID 等不完整响应不能触发删除；旧 activity 请求、切换目标及本地 action 跨越的响应不得发起成员同步。单独改名、排序或布局调整而 pane 集合不变，不能靠此信号保证同步。

`workspace_api.getMutationState()` 暴露不可变的本地 action version/pending 快照，pending 仅针对当前 target/generation；旧目标尚未完成的 POST 不阻塞新目标。`state_apply_controller.getRevision()` 是本地已应用快照的单调序号，不是服务端 `workspace_generation`，不会引发终端重建。refresh owner 对成员请求保持单个当前 context，同一观察合并为一个 Promise，飞行期间确有新的成员观察才补取；本地 mutation、新 state revision、目标 generation 或 dispose 变化后拒绝迟到结果。普通 refresh 同样不能覆盖请求期间已经应用的新状态；初次 bootstrap 尚未应用前，成员同步等待正常恢复入口。失败由后续既有 activity 再观察，不安排额外循环。

`apply(state, { preserveLocalState:true })` 是远端成员同步模式。workspace generation 没变时，已有 tab button、pane、Canvas 和未变布局保持原实例；通过 `tab_view.syncTabButtonOrder()` 插入/调整按钮位置。保留本端 active tab/pane、最近访问列表、焦点和输入，背景新建/删除不重新激活或 resize 当前 tab。只有活动 tab/pane 已消失或成员结构实际变化才进行必要切换/布局更新。新的逻辑 pane 通过既有 transport membership 接线，cleanup 与 generation guard 仍归原模块；不重连已有终端。workspace generation 真正变化时仍走完整恢复。状态应用后的 RAF 必须匹配目标 generation、当前活动 tab 及其对象 identity；无关后台成员更新不能取消当前 tab 尚未执行的有效首次 fit/connect，但切走或销毁的 tab 不得执行迟到回调。

权威 workspace 把异常退出的最后一个 pane 标记为 `exited` 并保留时，state apply 不得把已经观察到退出终态的 session 重新置为 pending connect。首次加载该状态仍允许 transport 接入一次，以回放故障前的终端输出并取得权威退出帧。

## 文件

- `index.js`：唯一公开入口。
- `workspace_api.js`：workspace/activity URL、GET/POST 请求、selector guard、本地 action mutation fence 和当前响应应用边界。
- `persistence_controller.js`：启动恢复、URL、last/restart tab、活动 tab 持久化队列与导航 suppression。
- `presentation_controller.js`：tab 自动标题、页面/移动标题、通知标记、空工作区和 cursor blink 的唯一 UI 状态 owner。
- `refresh_controller.js`：workspace request/apply、恢复性能指标、直接刷新与 retry 命令协调，以及无额外 timer 的成员同步请求合并。
- `refresh_lifecycle.js`：指数退避、jitter、retry context/timer/in-flight、在线恢复和销毁。
- `state_apply_controller.js`：权威 state 的 tab/pane reconciliation、活动 tab 选择、cache preload 与后续命令编排。
- `state_apply_lifecycle.js`：state apply 后 resize/connect RAF 的唯一 owner 与销毁清理。
- `layout_controller.js`：纯布局树拆分、删除、遍历和方向选择算法。
- `layout_view_controller.js`：布局 DOM 渲染、分割线拖拽和布局持久化命令适配；拖动比例按 RAF latest-only 合并，并通过注入命令 begin/update/end terminal live geometry。workspace 不修改 terminal 状态或发送 resize 帧，释放时只结束事务并持久化最终布局。
- `tab_registry.js`：tab Map、ID 序列、活动 tab 和最近 tab 快照的唯一状态 owner。
- `activity_controller.js`：既有 workspace activity 轮询、pane busy 状态同步、成员集合变化检测和关闭确认 guard。
- `tab_label_controller.js`：tab 标题展示、desktop inline rename、optimistic 提交与失败回滚。
- `tab_label_lifecycle.js`：inline rename 的 AbortController、focus RAF 和销毁资源。
- `tab_navigation_controller.js`：tab DOM 顺序、前后/索引切换、最近 tab 交换与按实例持久化。
- `tab_controller.js`：tab/pane 创建、分屏、关闭、重命名、移动、实例 reset，以及远端 action 与权威 apply 的分流编排。
- `tab_view.js`：tab button、tab pane host、DOM 事件、上下文菜单绑定和 DOM 排序。
- `tab_lifecycle.js`：tab context cleanup、延迟 rename RAF、单 tab 与模块级幂等销毁。
- `tab_activation_controller.js`：tab 激活同步保帧/视觉提交和异步 active pane、用户切换时的可见 pane claim、membership、持久化编排；权威 state apply 必须显式关闭 claim。
- `tab_activation_scheduler.js`：tab 激活的分阶段调度和生命周期。
- `pane_activation_controller.js`：pane 激活、点击定位、用户 pane 切换/指针交互的 claim、被动 resize/连接命令和 `activate_pane` 持久化编排。
- `pane_activation_lifecycle.js`：pane focus RAF 的唯一 owner，销毁时取消迟到 focus。
- `target_controller.js`：实例目标切换、generation guard、workspace reset 与 refresh 编排。
- `target_lifecycle.js`：活动 selector、generation 和目标生命周期状态。

## 依赖与验证

跨端成员同步真实回归见 `spec-tests/workspace/cross-device-tab-sync/`：PC 保持三个测试 tab 和持续输出，移动端新增/关闭 tab 后 PC 无 reload 自动同步；验证原 tab/button/Canvas/焦点/物理 WS 不变、新标签可真实输入，以及无变化的 activity 不增加 workspace GET。Node 行为测试补充成员比较、请求合并、本地 mutation/状态 revision/目标 generation fence、被动应用保留本端交互和 dispose。

模块只依赖注入的 DOM、fetch、storage、session/cache/resize 命令和 frame/timer API。行为测试为 `workspace_api_controller_test.mjs`、`workspace_persistence_controller_test.mjs`、`workspace_refresh_controller_test.mjs`、`workspace_state_apply_controller_test.mjs`、`workspace_tab_controller_test.mjs`、`workspace_tab_activation_controller_test.mjs`、`workspace_target_controller_test.mjs`、`workspace_layout_view_controller_test.mjs`、`tab_activation_scheduler_test.mjs` 及其余 workspace controller 测试；跨模块 guard 位于 `runtime_shortcuts_test.go` 和对应 `spec-tests` 场景 README。最小回归是切换实例并检查旧目标请求失效、新目标 workspace 应用、快速切换 tab、新建/分屏/关闭/重命名/移动 tab 与 pane、断网恢复、刷新页面和服务端增删 pane，确认切换前保帧、视觉提交先于 resize/membership、权威 state apply 顺序稳定、retry 单飞、selector 不串目标、旧帧不被清空，历史回放中间过程不可见；分割条高频拖动期间 flex 比例按 RAF 合并、每个 pane 的 live Canvas 顶部稳定并随宽度重排、pointermove 不持续创建网络 resize，释放时必须持久化并提交最终比例。
