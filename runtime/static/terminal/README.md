# 终端前端模块

`terminal/` 是浏览器终端责任域的聚合目录。各子域通过自己的 `index.js` 暴露单一公开入口，`global-runtime.js` 只负责创建 controller、注入依赖和按页面生命周期调用公开 API。

## 不可破坏的边界

- 容器与受管理的客户端工作区都只使用一条 Unified 物理 WebSocket；每个 pane 是独立 logical stream。
- 普通容器历史以 persistent agent 的 PTY 原始字节为唯一权威。打开 logical stream 时直接请求服务端 `snapshot + live`，不读取浏览器历史、不发送本地 cursor range、不使用 Cache API。
- `client:` target 使用同样的服务端快照与原始历史回退；不再保留独立直连调度或 IndexedDB 终端历史。
- Canvas 不是历史权威。history replay、snapshot、原子 resize 和重连的中间过程不得显示；已有同身份画面必须作为 last-known-good frame 保留。桌面分屏/窗口及已提交终端的字号/行高 live geometry 可乐观重排当前真实 Canvas，但不能提交 replay 或跨 identity 内容。
- session 只组合状态和生命周期，不实现 transport、history、rendering、resize 或 input 算法。

## 目录

- `history/`：两种实例共用的服务端 replay 提交门禁与 checkpoint。
- `config/`：终端共享的不可变阈值和超时。
- `output/`：live/replay/suppressed 输出队列、有界 drain、过载重同步和 Queue turn ACK。
- `transport/`：Unified/direct 连接、协议、健康检查、membership 和主题发送。
- `rendering/`：Ghostty renderer/runtime、presentation、Kitty graphics、RenderSnapshot 和 frame hold/release。
- `resize/`：resize controller、scheduler、单 in-flight/latest target、尺寸同步，以及 interactive/metrics 多 source live geometry。
- `viewport/`：移动 visualViewport、软键盘、安全偏移和方向恢复。
- `interaction/`、`mouse/`、`selection/`：菜单、搜索、剪贴板、链接、mouse 协议和选区。
- `overview/`：标签总览、live/hold/IndexedDB 派生图片缩略图、拖拽和移动端手势；持久图片不保存或恢复 PTY 历史。
- `screenshot/`：终端长截图。
- `input/`：输入队列、generated response、helper textarea、IME、焦点和移动快捷键；不维护跨页面、Provider 或 agent 输入锁。
- `policy/`、`tui_adapters/`：工具识别策略和隔离的 TUI 适配器。
- `metrics/`：字体 metrics、live options 和尺寸估算。
- `session/`：pane 身份、初始状态、资源工厂、安装编排和幂等销毁。

新增终端子模块必须提供 README、单一公开入口、明确状态 owner 和可重复清理入口。
