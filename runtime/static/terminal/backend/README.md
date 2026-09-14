# 终端后台执行

每个 pane 的 Ghostty 终端实例运行在独立 Dedicated Worker。UI 保留 DOM、Canvas、输入与唯一业务连接；Worker 执行 VT 解析、历史重排和文本查询，不创建 PTY、不执行用户命令、不建立业务 WebSocket。

## 模块与入口

- UI 根 `global-runtime.js` 创建 `createTerminalBackendManager()`，接线 session health、资源创建与销毁。
- Worker 根 `global-backend-worker.js` 创建 engine/runtime，接线消息与生命周期；实现位于 `worker/`。
- `index.js` 是 UI 公开入口，`worker/index.js` 是 Worker 根使用的公开入口。
- `backend_manager.js` 管理 session 与 Worker，提供 attach、bindSession、prepareRecovery、dispose。
- `remote_terminal.js` 持有 RPC、代际、后台确认状态、完整帧及有界历史窗口。
- `terminal_adapter.js` 保留 Ghostty DOM/Canvas 接口，写入和重排等待 Worker 完成。UI 不创建原生 VT 实例，轻量键盘编码仍使用原有 encoder。
- `cell_packet.js` 使用 transferable 单元格数据和稀疏组合字符，避免复制全部历史。

## 顺序与呈现

v17 的 `restore` RPC 属于同一串行通道，在独立、相同 WASM 指纹的模块实例内导入 Agent 状态。`checkpointRestorePending` 期间 `isReady=false`，禁止提前提交回放；重连/重置仍按 generation 退休旧操作。导入只重建 Worker 自己的 VT，不覆盖 UI 所用的键盘编码实例。`memory_checkpoint.js` 是固定 wrapper/引擎 ABI 的唯一适配点，恢复所有原生指针后清除旧 JS 缓冲指针，并应用当前浏览器主题默认值；不修改程序显式设置的动态颜色。日志新增 `state_checkpoint_restore_start/complete`。

v19 的 `diagnose` RPC 仅由手动渲染捕获调用。`worker/render_diagnostics.js` 读取独立的原生活动屏幕及 RenderState，不刷新缓存、不标记 clean、不推进 revision，也不向 UI 提交新帧；响应只含逐行指纹与占格分布。`cell_diagnostics.js` 统一 UI 和原生对照口径。诊断失败或超时不进入终端故障恢复，缺少新 ABI 时返回明确的不可用状态。

每个 Worker 只有一条串行命令队列。write Promise 在后台解析并回传状态后才兑现；output owner 此后才能出队、推进历史游标及发送 ACK。在途字节仍计入输出队列，postMessage 不等于处理完成。

resize 成功后才提交 UI 行列数，由 resize owner 完成事务。等待期间保留现有 Canvas；首次回放、原子 resize 和恢复继续遵守 presentation 门禁。首次 DOM fit 不重置已开始接收历史的 Worker。

snapshot/legacy/cache 回放先将空引擎调整到服务端提供的回放网格，再消费历史；本地 DOM 尺寸意图保留到回放完成后应用。跨连接完成的旧原生修改会使引擎失效并请求权威重放，避免拿旧确认游标复用已被修改的内存。

前台和后台写入均只回传解析进度与协议响应。恢复可见或回放结束后，UI 按需补取完整帧；初次呈现及几何／回放代际切换要求对应帧就绪，稳定几何下可以先显示较早的完整帧，再继续追赶最新解析进度。历史按稳定行编号缓存，重排 epoch 改变即失效；复制、搜索和链接查询在 Worker 执行，截图分段读取真实历史。

## 生命周期与边界

Worker 随 pane 创建和销毁；reset 终止旧 Worker 并启动新代际，拒绝旧请求，迟到回复不覆盖新状态。出错或持续超时后由 UI 终止对应 Worker，通过 session health 有限恢复：先重建后台，再请求权威历史，服务端进程继续运行。

RPC 最多同时 64 项、在途输入最多 4 MiB。UI 历史最多 `max(512, viewportRows * 4)` 行，每次分段读取 64 行；文本导出最多 32 Mi 字符。Worker 数量随存活 pane 变化，关闭 pane 时终止。初始化超时 20 秒，其他请求 15 秒；页面隐藏或 UI 长暂停后重建观察窗口。Worker 不是进程隔离，也不能强制重启 UI 主线程。

Vite 将 module worker 入口和 WASM 放入版本化资源集合。不回退到 UI 线程解析。真实使用由开发者手动验证，本轮不新增场景测试。

v20 保留原生 resize 的错误名供服务端诊断读取，resize 原有成功／失败返回值与终端行为不变。错误名通过静态 WASM 内存读取，失败后不额外申请原生堆内存；同一模块每次调用记录最后一次 resize 错误。新 WASM 指纹需要前后端同步更新。

v21 中 write 只解析、返回代际／模式／回复等轻量进度，不更新 RenderState、不打包整屏。UI 在需要绘制时请求一个 snapshot，同一 pane 最多一个 snapshot 在途；后续字节不取消已经生成的完整帧。绘制期间从同一帧读取尺寸、光标和历史坐标，消费进度与画面版本分开。隐藏 pane 继续解析，恢复可见后按需生成视口。

恢复预备的 Worker 可供紧接着的回放 reset 复用一次；仅在 generation、配置和命令序列均未改变时生效。任何后续命令、失败或配置变化都回到原来的完整重建。

`worker/synchronized_output.js` 观察原生 DEC 2026 模式，最多等待 1000ms 的同步展示区间；期间字节消费与终端回复继续，snapshot 不更新或清理 RenderState。超时只允许展示，不注入原始字节、不修改原生模式。UI 有代际隔离的定时唤醒，退出同步模式立即恢复普通按帧绘制。`frameRevision`／`viewportRevision` 表示缓存帧版本，`revision` 表示解析进度，`frameCurrent` 区分两者；旧完整帧保留自己的消费游标，不得标成最新字节已展示。

只读捕获区分 Worker 的解析 `revision` 与 RenderState 的 `cachedRevision`，UI 指纹只和同版本 RenderState 对照。解析已经前进但尚未到下一次画面生成时，`cacheCurrent=false` 属于预期的阶段差异，不能直接判定为漏渲染。

v22 通过 `tools/ghostty-reflow-capacity.patch` 修复原生 PageList 的受管资源重排：按目标页面当前容量扩容；超链接先复用已存在条目，分别按实际 URI／ID 分配结果处理不足；组合字符扩容不再误改超链接容量。页面 clone 仅在未发布的新页面上重试，对缺少的字符串、样式或映射资源扩容，成功前不替换源页面和 tracked pins。重试最多 8 次，整数溢出与真实堆分配失败继续报错，不清除错误标志后复用半重排状态。新 WASM 必须同时进入前端资产和 Go Agent；保留 v21 调度优化，不用重连替代原生修复。
