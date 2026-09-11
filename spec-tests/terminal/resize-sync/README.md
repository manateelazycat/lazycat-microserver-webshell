# PC 与移动端尺寸接管及重连输入恢复

规格：[REQ](../../../spec/terminal/resize-sync/REQ.md) · [AC](../../../spec/terminal/resize-sync/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/resize-sync`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：multi-device / lifecycle
- 真实依赖：Google Chrome、Provider、persistent agent、共享 PTY、Unified WebSocket、workspace activity API
- 相关模块和源码入口：`runtime/static/terminal/resize/`、`runtime/static/terminal/input/`、`runtime/static/terminal/transport/`、`runtime/static/terminal/session/`、`runtime/static/workspace/`、`spec-tests/run-playwright.mjs`

## 触发条件

desktop（1440x900）与 mobile（390x844）两个浏览器上下文连接同一个 workspace pane。两个设备通过 focus、pointer 或 viewport 操作交替接管终端尺寸；测试在 mobile viewport 改变产生 `claim:true` 后立即关闭当前 Unified 物理 WebSocket，使 resize 等待 ACK 期间确定性发生 logical connection 重建，用户随后立即输入。

## 用户可见问题

- 旧测试把“本设备已通过 focus/recovery 提前完成 claim，随后点击被正确去重”误报成“点击没有发送 resize”。
- 真实缺陷是 resize 请求仍绑定旧 connection epoch 时发生重连：新连接的 ACK 被判为 stale，`resizeAckPending` 长时间不能退出，用户输入持续排队且终端看起来没有反应。

## 预防的回归

- 不同尺寸设备的显式使用意图必须获得匹配 epoch/geometry 的 `resize-applied`；若另一设备随后以更高 epoch 接管，则遵循 last-writer-wins，不能把稍后的服务端最终尺寸反推为前一个设备从未接管。
- focus/recovery 已经完成同一设备 claim 时，后续点击允许不重复发送相同 resize。
- 测试必须按最终服务端尺寸和严格更新的 claim epoch 判断接管，不能只依赖点击后的 frame 数增量。
- resize 事务不得跨 connection epoch 保留旧状态机绑定；旧连接 ACK 不能修改新连接状态。
- 最新 pending target/current-device claim 在新连接中至多重发一次。
- 重连期间输入保持顺序，并在 replay、socket 和 resize 就绪后只发送一次。
- 两端持续收到同一 PTY 输出，Canvas 非空，每页只有一条 Unified 物理 WebSocket。

## 修复前基线

- 测试误报基线：`artifacts/2026-09-04T09-19-03-673Z/`。mobile 已成功 claim `39x38`；desktop 在测试执行显式 click 前已经发送 `claim:true` 的 `144x41` resize，服务端也应用该 epoch。测试仍要求 click 后 frame 数新增，因当前实现正确去重而失败。trace 中 click 前后的 `__testsAutoResizeFrames` 均已包含 desktop claim，证明旧断言观察边界错误。
- 修复后第 3 次连续运行在 `artifacts/2026-09-04T10-00-00-808Z/` 暴露第二个观察竞态：desktop claim `1788516020076472` 已收到匹配 `resize-applied` 并生效，约 80ms 后 mobile 的有效 viewport/focus claim `1788516020089603` 以更高 epoch 接管，轮询只看到 mobile 最终尺寸。用例现在要求本设备严格更新的 claim 获得匹配 ACK，或仍匹配当前服务端尺寸；仅发送 frame 而没有 ACK 不能算接管成功。
- 产品缺陷基线：`../viewport/artifacts/2026-09-04T09-17-28-118Z/`。desktop 在 resize pending 期间从 connection epoch 1 重建到 2，新连接收到 resize ACK 后由 `TerminalResizeController.assertCurrent()` 抛出 `resize request or connection epoch mismatch`；高层保留 `resizeAckPending=true`，输入 marker 15 秒内没有进入 WebSocket，随后触发 resume probe/reconnect。
- 本场景历史上多次通过，说明问题是时序竞态而不是稳定断线；修复必须建立 deterministic Node 不变量，并用真实场景连续运行锁定风险，不能依靠重复重试获得偶然通过。

## 已确认根因

1. `test.mjs` 从 2026-08-29 起要求每次 click 后必须新增 resize frame，没有跟随当前“focus/recovery 可提前 claim、同设备重复交互去重”的契约更新。
2. `session_protocol_controller.js` 推进 `session.connectionEpoch` 时没有通知 resize owner 结束旧 connection transaction。
3. `session_recovery_controller.js` 断开 socket 时不处理 resize 状态；`resizeController`、`resizeAckPending`、fence 和 requested epoch 可能继续绑定旧 connection。
4. 新连接的 replay/ACK 因旧状态机 connection epoch 不匹配而被拒绝；`input_controller.js` 又把 `resizeAckPending` 作为普通输入 ready gate，最终形成输入长期排队。
5. 现有测试只覆盖同一 connection epoch 的 ACK/retry，未覆盖 pending resize 跨 reconnect。

## 实施方案

- 调整测试观察面：设备接管以“存在晚于上一设备 claim 的本设备 `claim:true`，且获得匹配 epoch/geometry 的 `resize-applied` 或仍是当前服务端尺寸”为准；如果 claim 已在 click 前由 focus/recovery 发出，不要求重复 frame，另一设备随后以更高 epoch 合法接管也不抹除前一个 ACK 事实。
- resize controller 增加 connection transition 入口，失效旧状态机绑定、清理旧 ACK/fence/settle，同时保留 latest pending target 和 current-device claim 意图。
- transport 每次推进 connection epoch 时只调用 resize 的公开 transition 命令，不直接修改 resize 内部字段。
- 新连接 replay 采用服务端当前 resize epoch/geometry；需要接管时按最新 DOM 几何在新 connection 中只提交一次 claim。
- ACK 或 reconnect 完成后显式触发 pending input flush；旧 connection callback 继续由 socket/generation guard 拒绝。
- 扩展 Node 测试覆盖 reconnect、迟到 ACK、pending claim 和输入只发送一次；真实场景在 mobile viewport claim 发出后立即关闭当前 Unified 物理 WebSocket，要求 replacement socket、重放 claim、服务端几何和连接恢复后输入全部成立。

## 验证预期

- desktop/mobile 交替使用时服务端尺寸最终匹配当前设备，已有 claim 的重复点击不产生无意义 frame。
- pending resize 跨 reconnect 后不会保持旧 connection epoch；新 ACK 可完成事务。
- 用户 marker 在连接恢复后有界进入真实 PTY，两个窗口均只观察到一次。
- 连续至少 3 次运行本场景均通过，无 stale transaction 导致的输入阻塞。
- Canvas、Unified socket、console/pageerror/API error 和 cleanup 均满足现有门禁。

## 验证结果

2026-09-04 修复后验证：

- `artifacts/2026-09-04T10-04-00-411Z/`、`artifacts/2026-09-04T10-04-32-946Z/`、`artifacts/2026-09-04T10-04-59-704Z/` 连续 3 次通过。每次 mobile 都先发送 `422x714` claim 并立即关闭旧物理 socket，随后新 connection 以严格更高 epoch 重放同一 claim；socket 统计均为 `created=2`、`open=1`。
- 三次重放 claim 都获得匹配 `resize-applied`，workspace activity 最终为 `42x34 / 422x714`，transient resize error 为 0；断线期间输入的唯一 marker 均由 desktop/mobile 两端收到。
- 每次后续 portrait unfold/fold 和 6 轮 desktop/mobile 交替接管均通过，Canvas 非空，隔离 tab 已清理，console/pageerror/API error 为零。
- 定向行为测试与完整 Node/Go 结果见本次任务最终回归记录；本场景本身使用当前 Vite build、真实 Provider、persistent agent、PTY 与 Unified WebSocket，不使用 mock。
- 最终完整回归中的本场景产物为 `artifacts/2026-09-04T11-11-41-543Z/`，确定性物理断线、replacement socket、严格更高 epoch claim、PTY 输入恢复和 6 轮交替接管再次通过。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/terminal/resize-sync/test.mjs
```

连续回归由执行方重复运行同一命令至少 3 次；每次必须独立生成 artifacts，不能在脚本内部无限重试。

## 产物与失败诊断

- 运行器把截图、trace、JSONL、terminal timeline 和 presentation probe 写入 `artifacts/<run-id>/`。
- 失败时必须记录交互前后全部 resize frames、两端 activity 尺寸、当前 connection epoch、requested/applied/presented resize epoch、`resizeAckPending`、pending target/claim 和输入 payload。
- 判断测试误报时必须同时具备“click 前已有更新 claim”和“服务端已应用正确尺寸”的证据，不能仅因重跑通过而归类为环境问题。

## 已知限制

- mobile 是桌面 Chrome 的移动 viewport/touch context，不等同于 Android/iOS 真实 WebView。
- 网络/ACK 时序的稳定失败由 Node 测试精确构造；真实场景通过多轮设备接管和连接恢复扩大竞态覆盖，但不使用 mock Provider/PTY。

## 本次恢复风险回归（2026-09-07）

补强真实截图/OCR 和旧帧最终退出检查，同时验证真实 shell 计数结果按顺序且不重复。最终 reports/b1d5a5fc6cad45288af213f4fd3804f8 通过，用时 27.896 秒；桌面与移动布局各自的截图中，两条计数结果按顺序各出现一次，保帧覆盖层已退出。移动布局不能代替 Android 原生键盘。17 仅保留覆盖层检查，因本轮只授权 debug 容器而未执行 client: 场景。
