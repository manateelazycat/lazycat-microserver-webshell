# 分屏拖拽期间终端画面隔离与响应性

规格：[REQ](../../../spec/workspace/split-divider/REQ.md) · [AC](../../../spec/workspace/split-divider/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector workspace/split-divider`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / responsive / lifecycle
- 真实依赖：真实 Provider、persistent agent、两个真实 PTY、Unified WebSocket、Ghostty WASM、真实 Chrome Canvas
- 相关模块和源码入口：`runtime/static/workspace/layout_view_controller.js`、`runtime/static/terminal/resize/`、`runtime/static/terminal/rendering/`

## 触发条件

同一桌面浏览器、同一 tab 左右分屏。一个 pane 输出带真彩色红色背景的密集、可识别内容并保持进程运行；另一个新 pane 清屏、隐藏光标并保持空白。用户抓住两个 pane 之间的分割条，连续、快速地来回改变分屏比例。统一运行器为通用多设备场景创建的 mobile context 会在本用例开始时关闭，避免把跨设备 resize owner 竞争混入单浏览器复现场景。

## 用户可见问题

拖动时，有内容 pane 的部分文字可能错误地出现在空白 pane 中；刷新浏览器后错误画面消失。高频来回拖动还可能使页面长时间无响应。

## 预防的回归

- 桌面分屏拖拽使用 live Canvas 实时重排：Canvas 顶部保持稳定、宽度按有界节拍持续跟随 host 并在释放时精确收敛，不能显示或缩放 hold Canvas。
- 每个 pane 的 live Canvas 只能呈现自己的终端状态，不能复制或提交相邻 pane 的文字。
- 高频 `pointermove` 必须按浏览器绘制帧合并本地布局/网格工作；网络 resize 保持单 in-flight/latest target，拖拽结束必须提交最后比例。
- 拖拽结束后两个真实 PTY 都要完成最终 resize/presentation，页面 RAF 心跳必须继续前进。
- 分屏过程不得建立第二条页面级 Unified WebSocket，也不得出现 console/pageerror/API error。

## 修复前基线

2026-09-03 的两次前置校准运行使用本地 `runtime/static`、headless Chrome 和测试机真实 `debug@cloud.lazycat.lightos.entry`，均在拖拽前停止，因此不作为产品基线：

- `artifacts/2026-09-03T09-50-04-059Z/`：当前主题把 ANSI 16 色的 `31m` 映射为近黄绿色，红色来源哨兵未成立；已改用不经过 16 色主题映射的 24-bit 真彩色背景。
- `artifacts/2026-09-03T09-51-57-839Z/` 和 `artifacts/2026-09-03T09-54-44-123Z/`：两个 pane 的 Canvas、history replay 和 presentation commit 均已完成，但通用运行器的另一设备 context 参与或退出后，来源 pane 的展示标签停在 `reconnecting`。用例改以“presentation 已提交、后续真实命令有回显、唯一 Unified socket 活跃”判断本场景的逻辑流可用；网络错误和 fatal error 仍保持失败。
- `artifacts/2026-09-03T09-57-25-767Z/`：首次完成 100+ 次拖拽，耗时 59.9 秒并触发响应性断言；但该版本采样器每帧对多个完整 Canvas 做缩放读回，会放大 GPU 同步成本。此结果证明高频路径有风险，但在把像素采样降为每 6 帧一次、只读取空 pane 顶部小区域前，不作为最终可归因基线。
- 随后的前置运行进一步确认，关闭通用 mobile context 后初始来源 pane 也可能只保留已提交画面而展示 `reconnecting` 标签；测试因此从第一步开始统一使用 presentation、真实命令回显和物理 socket 判活，不把这个运行器副作用当作分屏拖拽失败。
- 最终修复前基线：`artifacts/2026-09-03T10-07-05-881Z/`，命令为 `HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/runtime/static" node spec-tests/run-playwright.mjs spec-tests/workspace/split-divider/test.mjs`，目标为真实 `debug@cloud.lazycat.lightos.entry`、桌面 Chrome 1440×900、当前前端资源、两个真实 PTY 和一条 Unified WebSocket。107 次 `pointermove` 产生 68 个 resize 控制帧，失败于“无界终端 resize 事务”断言；截图、trace、presentation probe 和 JSONL 均已保存。本次没有观察到持久红色像素串入，但 68 次相互交错的 ACK/hold/full-render 是锁定偶发串帧和卡顿风险的等价不变量。
- 2026-09-04 用户确认新的产品口径：桌面分屏拖拽不再用 hold 截图覆盖 live Canvas，而是接受文字在同一顶部位置随宽度实时换行/重排；replay、重连、首次恢复和移动端高风险几何仍保持原子呈现。
- 新口径修复前基线：`artifacts/2026-09-04T02-39-51-205Z/`，运行命令仍为本目录标准命令，真实目标为 `debug@cloud.lazycat.lightos.entry`。44 个 pointer 按下期间 RAF 样本全部出现不安全 live presentation：hold 可见、live Canvas 被隐藏或 Canvas 宽度没有跟随 host；用例按预期失败于 `divider drag did not present live top-anchored terminal reflow`。截图、trace、presentation probe、错误摘要和 JSONL 已保存。
- 实现中一次诊断运行 `artifacts/2026-09-04T02-55-23-617Z/` 在拖拽前停止：截图证明 source 命令已完整输入但独立 `keyboard.press("Enter")` 未进入 PTY，实际 OSC marker 没有出现。测试输入改为与已有终端输入场景一致的单次 `insertText(command + "\\n")`，仍以两次 marker（shell 回显与命令实际输出）判定命令确实执行；该次不计为产品失败。

## 已确认根因

`layout_view_controller.js` 在每个 `pointermove` 中同时改写两个 flex basis 并调用 `scheduleTabResize()`；两个 terminal host 的 `ResizeObserver` 也会各自调度 resize。拖拽没有独立事务或 suspension fence，因而移动事件持续为两个真实 PTY 创建 resize epoch、ACK fence、presentation hold 和 full render。修复前真实基线中 107 次移动产生 68 个 resize 控制帧。空 pane 与内容 pane 的 hold 虽由各 session 拥有，但如此密集的多 pane 中间事务会不断替换 Canvas/hold，并使偶发迟到提交和页面卡死的风险急剧放大。

上一轮通过“拖拽期间冻结 resize、每个 pane 捕获一次 hold、松手后最终 resize”把网络控制帧从 68 降到 2，但真机日志证明连续输出和频繁重复拖拽仍可能在上一轮 resize ACK/output settle 未完成时开始下一轮；旧 hold 会继续覆盖 live Canvas，presentation validation/retry 与新旧 epoch 相互放大，形成数秒视觉假死。新的实施目标因此是把交互式几何从 atomic recovery 中分离，不再让桌面拖拽进入 hold/presentation 门禁。

## 实施方案

workspace controller 在同一 RAF 中应用 latest-only flex 比例并请求 terminal resize owner 做本地 live fit；terminal resize controller 在交互期间直接调整当前 Ghostty 网格/Canvas并保持 live 可见，不创建 hold，也拒绝 observer/普通 resize 与之竞争。本地 fit 以 80ms 上限节流并带 trailing timer，既限制 Canvas2D 重绘成本，也保证最后一次被节流的宽度能及时跟上。

网络侧每个 pane 同时只允许一个 resize epoch，后续尺寸只覆盖 latest pending target，ACK 后发送最新目标；拖拽结束强制最终本地 fit，并保证最终 `claim:true`。网络 watchdog 重试复用同一 epoch，不再制造本地 stale ACK。presentation 在 live geometry 中接受当前 Ghostty output 帧、停止常规 validation/retry 自旋并省略高体积逐帧诊断事件；隐藏 pane 也不再重复调度 validation。overview preview 在交互期间不捕获，稳定后只补一次。replay/reconnect 继续使用既有原子恢复策略。

修改文件：

- `runtime/static/workspace/layout_view_controller.js`、`runtime/static/global-runtime.js`
- `runtime/static/terminal/resize/resize_controller.js`
- `runtime/static/terminal/rendering/presentation_controller.js`
- `tests/workspace_layout_view_controller_test.mjs`、`tests/terminal_resize_controller_test.mjs`、`tests/terminal_presentation_controller_test.mjs`
- `runtime/static/README.md`、`runtime/static/terminal/README.md`、`runtime/static/workspace/README.md`、`runtime/static/terminal/resize/README.md`、`runtime/static/terminal/rendering/README.md`、`runtime/static/terminal/overview/README.md`、`docs/ARCHITECTURE_AND_MODULE_MAP.md`
- `runtime_shortcuts_test.go`（同步 live/atomic 分流和 workspace wiring 的架构 guard）
- 本目录 `README.md` 和 `test.mjs`

## 验证预期

- 来源 pane 在拖拽前后都存在足量红色像素。
- 空白 pane 在拖拽前后，其 live/hold Canvas 的红色像素均为 0，Canvas owner 始终属于当前 pane。
- pointer 按下期间 hold 始终隐藏、live Canvas 始终可见且 `renderReady=true`；两个 live Canvas 的宽度必须经过多个中间比例，本地 Canvas 在 host 持续变化时不能超过 350ms 不更新，顶部相对位置保持稳定，释放后最终宽度收敛。
- 拖拽 RAF 心跳不存在超过阈值的长停顿，最终分屏比例等于最后一次 pointer 坐标。
- 两个 pane 最终均为 `renderReady=true`、`hasPresentedFrame=true`，且 hold Canvas 隐藏；真实命令回显和唯一 active Unified socket 共同证明 logical stream 可用，`offline`、`network-error`、`error`、`closed` 仍视为失败。
- 页面只有一条 active Unified WebSocket，无 fatal error。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 \
WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/workspace/split-divider/test.mjs
```

默认由 `spec-tests/.env` 提供测试地址和认证信息；凭据不得写入本目录源码或产物摘要。需要调查失败时可额外设置 `WEBSHELL_CAPTURE_TERMINAL_TIMELINE=1`，但响应性基准以未开启高密度 debug timeline 的命令为准。

## 产物与失败诊断

运行器把失败截图、Chrome trace、终端 timeline、presentation probe、错误摘要和逐事件 JSONL 写入 `artifacts/<run-id>/`。用例额外把拖拽像素隔离、RAF 间隔、pointermove 数量、最终 pane 几何和 resize frame 数写入事件日志。失败时必须联合这些产物判断，不能用放宽像素阈值或增加固定等待掩盖问题。

2026-09-03 第一阶段“冻结 resize + hold”结果（后续真机日志证明它不是最终方案）：

- 真实场景通过，最终产物为 `artifacts/2026-09-03T10-13-40-619Z/`。107 次 pointermove 只产生 2 个 resize 控制帧（两个 pane 各一次最终提交），修复前为 68 个；拖拽耗时 6396ms，RAF 最大间隔 70.8ms。
- 空 pane 拖拽前后 `red=0`、`bright=0`，跨 pane hold `drawImage=0`、Canvas owner 异常为 0；来源 pane 的真彩色哨兵在最终 resize 后仍存在。
- 两个 pane 最终 `renderReady=true`、`hasPresentedFrame=true`、hold 隐藏；最终 pane 宽度约 907/533，符合 63%/37%；物理 Unified WebSocket 始终为 1 条。
- `node --test tests/*_test.mjs`：412/412 通过。
- 受影响 Go/架构 guard 定向命令通过：`go test -run '^(TestTerminalResizeControllerBehavior|TestTerminalResizeSchedulerBehavior|TestRuntimeResizeEpochAckGuard|TestRuntimeCrossClientResizeDoesNotAutoReclaim|TestRuntimeTabResizeDoesNotTemporarilyActivateAllTabs|TestRuntimeWorkspaceModuleBoundary|TestRuntimeGlobalRuntimeOwnsApplicationLifecycle|TestRuntimeTerminalPresentationModuleBoundary|TestRuntimeTerminalRendererAdapterModuleBoundary|TestRuntimeStaticModulesAreGroupedByResponsibility)$' ./...`。

2026-09-04 live geometry 最终方案结果：

- 实现中的持续输出诊断先在 `artifacts/2026-09-04T02-57-07-764Z/` 暴露无节流 Canvas2D 重排成本：拖拽耗时 18.473 秒、最大 RAF 间隔约 1050ms。加入 80ms 本地 fit 节流后，`artifacts/2026-09-04T03-00-16-259Z/` 又暴露被节流的最后一次尺寸可能等待下一个 pointer 事件，Canvas 跟随间隔达到 618ms；实现因此增加独立 trailing fit timer，而不是放宽页面卡顿门槛。
- `artifacts/2026-09-04T03-06-26-527Z/` 证明“host 与阶梯式 Canvas 连续不完全等宽的总时长”会把正常追帧误报为冻结：presentation probe 显示 Canvas 实际约每 80–100ms 更新并经过全部中间宽度。断言改为直接测量“host 仍变化时 live Canvas 最长未更新时长”，仍严格要求拖拽全程 live 可见、hold 隐藏、顶部锚定和最终精确收敛。
- 去掉调查期额外布局探针并补齐 pointer capture 清理后的标准无 debug 最终运行 `artifacts/2026-09-04T03-23-28-848Z/` 通过；目标为真实 `debug@cloud.lazycat.lightos.entry`。107 次 pointermove、67 个有效 RAF 样本、15 个不同 live Canvas 宽度；最大 RAF 间隔 66.7ms、最大 live Canvas 停滞 120ms、拖拽耗时 8.523 秒。两个 pane 的 `unsafeLiveSamples=0`，跨 pane draw/owner 异常均为 0。
- 网络 resize 仍只有 2 帧（两个 pane 各一次最终提交），两个 pane 都完成 `live_geometry_complete`，`resize_ack_stale=0`、`presentation_retry_exhausted=0`；空 pane 前后红色/亮色像素为 0，来源哨兵保留，最终宽度约 907/533，Unified 物理连接始终为 1 条。
- `node --test tests/*_test.mjs`：419/419 通过。
- 受影响真实场景均以本地 `runtime/static` 和真实 Provider/agent/PTY/WebSocket 通过：`01`（`artifacts/2026-09-04T03-11-06-934Z/`）、`04`（`artifacts/2026-09-04T03-14-07-722Z/`）、`05`（`artifacts/2026-09-04T03-14-55-262Z/`）、`08`（`artifacts/2026-09-04T03-15-36-259Z/`）、`09`（`artifacts/2026-09-04T03-16-09-921Z/`）、`10`（`artifacts/2026-09-04T03-17-01-195Z/`）和 `12`（`artifacts/2026-09-04T03-17-47-227Z/`）。场景 04 第一次运行漏传其 README 要求的 iPhone User-Agent，停在操作前连接门槛；按场景标准命令补齐环境后通过。
- 受影响 Go/架构 guard（含新的 live geometry wiring、同 epoch retry 与 overview capture 门禁）通过：`go test -run '^(TestTerminalResizeControllerBehavior|TestTerminalResizeSchedulerBehavior|TestRuntimeResizeEpochAckGuard|TestRuntimeCrossClientResizeDoesNotAutoReclaim|TestRuntimeTabResizeDoesNotTemporarilyActivateAllTabs|TestRuntimeWorkspaceModuleBoundary|TestRuntimeGlobalRuntimeOwnsApplicationLifecycle|TestRuntimeTerminalPresentationModuleBoundary|TestRuntimeTerminalRendererAdapterModuleBoundary|TestRuntimeTerminalOverviewModuleBoundary|TestRuntimeStaticModulesAreGroupedByResponsibility)$' ./...`。仓库级 `go test ./...` 除下述既有 Canvas residue guard 外均执行完成。
- 本轮预检 `artifacts/2026-09-04T10-33-09-833Z/` 完成全部真实拖拽与像素/响应性/连接断言后，仅因 source pane 的 `live_geometry_complete` 计数为 0 失败。该 pane 的持续输出把诊断环形缓冲压缩到最近 96 条，早于约 16.6 秒的事件均被淘汰；quiet pane 仍保留 begin/end/complete。source pane 最新 `resize_server_geometry_observed` 明确为 `sizeClaimed=true`、`resizeAckPending=false`、fence/hold=false、`renderReady=true`，证明事务已经完成。
- 健康门禁因此改为两 pane 最新 resize 状态必须 settled；`live_geometry_complete` 保留为诊断计数，不再要求它必须幸存在有界 timeline 中。`resize_ack_stale`、`presentation_retry_exhausted`、最终宽度、Canvas 隔离、live 跟随、RAF、resize frame 上限和唯一 socket 断言保持不变。

## 已知限制

本场景验证测试机真实 Provider/agent/PTY/Unified WebSocket 与 headless 桌面 Chrome 的左右分屏；未运行前台可视 Chrome 或独立物理设备人工验证。上下分屏复用同一布局控制器和 resize/presentation 链路，但本用例不单独覆盖触摸拖拽；若后续出现方向或触摸专属问题，应扩展本目录而不是建立近似重复场景。

最终实现改用运行器记录的协议响应证明两个 pane 的最终 claim 均获得同 epoch/geometry `resize-applied`。独立预检及最终全量 `artifacts/2026-09-04T11-16-04-028Z/` 均通过；当前 `go test ./... -count=1` 全部通过，此前记录的 Canvas residue guard 阻塞已经过时。
