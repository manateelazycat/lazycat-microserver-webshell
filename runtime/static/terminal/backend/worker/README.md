# Worker 内部模块

`global-backend-worker.js` 持有本线程 engine/runtime 实例，通过 `index.js` 导出的公开入口接线。

- `worker_runtime.js`：串行消息处理、回包、失败状态与 listener 生命周期，使用根入口注入的 engine 和查询函数。
- `terminal_engine.js`：本 Worker 唯一原生终端 owner，负责随包 WASM、解析、重排、模式与响应、完整帧和历史窗口。
- `text_queries.js`：在真实原生历史上复制、搜索和定位链接，不向 UI 镜像全部历史单元格。

本目录不依赖 UI runtime、DOM、业务 WebSocket 或工作区状态。错误经消息交回 UI；强制终止由 UI 的 Worker owner 执行。

`allocation_diagnostics.js` 在原生 write/resize 失败后只读固定诊断 ABI，缺少接口时明确返回 unavailable，不导出字符串或完整内存。

启用渲染捕获或字节 IO 后，resize/restore（及首帧前的 snapshot）通过 `operation-phase` 消息报告 Worker 接收、开始、原生 resize、RenderState 更新和视口准备。阶段消息不进入 RPC 成功/失败结算，不改变串行队列；没有结束标记需要结合代际、排队与超时判断，不能单独判定卡死。正常逐字节输出不启用阶段消息。
