# Worker 内部模块

`global-backend-worker.js` 持有本线程 engine/runtime 实例，通过 `index.js` 导出的公开入口接线。

- `worker_runtime.js`：串行消息处理、回包、失败状态与 listener 生命周期，使用根入口注入的 engine 和查询函数。
- `terminal_engine.js`：本 Worker 唯一原生终端 owner，负责随包 WASM、解析、重排、模式与响应、完整帧和历史窗口。
- `text_queries.js`：在真实原生历史上复制、搜索和定位链接，不向 UI 镜像全部历史单元格。

本目录不依赖 UI runtime、DOM、业务 WebSocket 或工作区状态。错误经消息交回 UI；强制终止由 UI 的 Worker owner 执行。
