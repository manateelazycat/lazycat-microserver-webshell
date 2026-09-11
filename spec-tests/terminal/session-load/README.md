# 满历史多会话响应性

对应 [REQ](../../../spec/terminal/session-load/REQ.md)、[AC](../../../spec/terminal/session-load/AC.md)、[PERF](../../../spec/terminal/session-load/PERF.md) 和共享 [ENVIRONMENT](../../ENVIRONMENT.md)。

使用专用测试目标上的 Provider、十个独立 PTY、单 Unified WebSocket、当前构建的 Ghostty WASM/Canvas。原 `terminal/output` 与 `workspace/split-divider` 保留轻量输出与像素隔离回归；本模块以满历史工作区定位恢复、持续输出及布局卡顿。

## 运行

通过统一入口选择 `terminal/session-load/SC-SESSION-LOAD-RESPONSIVENESS`，超时 1800 秒。`--env-file` 使用绝对路径，避免执行器切换目录后解析错误。本地专用配置位于被忽略的 `spec-tests/.state/load.env`。

- `WEBSHELL_LOAD_OUTPUT_PANES=1` 为基础档，3 为严格档。
- `WEBSHELL_LOAD_CPU_RATE=4` 仅用于定位，默认 1。
- `WEBSHELL_LOAD_PROFILE=1` 记录恢复及交互期间的 CPU 调用栈，属于带采样开销的诊断运行。
- `WEBSHELL_LOAD_ORIGINAL_SCROLLBACK=5000` 表示用户确认保存的显式原值；运行前 HTTP 核对，临时改为 100000，结束后恢复并核验。不匹配时拒绝覆盖。

资源由测试通过真实终端输入生成；十个 `/dev/pts/*` 身份必须独立，历史序号必须连续。只清理本轮自建标签，不改动原有会话。生成任务有界，输出观察缓冲有界，页面错误立即终止等待并保存现场。

基准关闭逐帧截图 trace 与高频诊断，采样真实 WASM 耗时、标签本地响应和约 100ms 的可见 pane 几何。协议读取不能替代最终 Canvas 像素验证。Android 当前构建资源绑定和单 PTY 观察已校准；原生压力动作尚未完成，脚本明确拒绝用桌面操作冒充 Android 验收。

## 当前证据（2026-09-09）

- `0b985faed8984f88bc8bc0606ef573c2`：第九个 PTY 填充时出现负内存偏移，WASM 内存为 2,158,428,160 字节。属于真实产品故障，尚未进入完整性能测量。已修正随包 JS 的 wasm32 无符号地址转换。
- `6acf69e2947343d094b71afe5d8ed477`：十个 PTY 填充及连续性检查通过，地址故障未再现；恢复时命令回显超过 20 秒。CPU 采样约半数空闲，42 MB 接收量分摊于全部会话；CRC 逐位校验自耗时约 2.3 秒。已据此修改可见标签优先恢复、后台分批接入及 CRC 查表，正在同条件验证。

上述报告位于 `spec-tests/reports/<run-id>/terminal/session-load/`，两轮自建资源均已清理，配置恢复 5000。尚未取得完整性能通过结果，不能宣称 Android 或当前 LPK 正式验收通过。

真实观察校准入口为 `spec-tests/environment/webshell-test-harness/load-preflight.mjs`：独立真实 PTY 生成并读取 400 行，验证 WASM reset 映射和完整行缓冲，只承担环境校准。默认历史 5000 的独立 Provider HTTP 验证已随 `5cadf82` 提交推送，不重复承担本模块验收。键盘 v3/v4 已交付，客户反馈待定，不新增键盘自动验收。
