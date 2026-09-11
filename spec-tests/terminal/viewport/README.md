# 移动终端键盘与 Viewport 恢复

规格：[REQ](../../../spec/terminal/viewport/REQ.md) · [AC](../../../spec/terminal/viewport/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/viewport`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：mobile / responsive / lifecycle
- 真实依赖：真实 Provider、persistent agent、PTY、Unified WebSocket、Chrome、Ghostty WASM
- 相关模块和源码入口：`runtime/static/terminal/viewport/`、`runtime/static/terminal/input/ime/`、`runtime/static/terminal/resize/`、`runtime/static/terminal/rendering/`、`runtime/static/style.css`

## 触发条件

移动窗口使用 iPhone User-Agent 进入 iOS visualViewport 分支。移动端等待真实终端 DOM 可见后按用户路径点击终端并输入唯一 marker，以 PTY 回显、稳定 presentation 和不可见状态点确认可用；不再把展示层 `data-connection` 恰好为 `open` 作为前置条件。随后聚焦 helper textarea，通过 synthetic visualViewport 高度变化模拟软键盘打开；blur textarea 并恢复 visualViewport 高度，模拟软键盘收起。横竖屏和 portrait-to-portrait viewport 变化完成后再输入第二个 marker，验证 logical stream 仍可用。跨设备输出同步与 resize 跨重连输入恢复统一由 `spec-tests/terminal/resize-sync` 负责。

## 用户可见问题

软键盘收起时，终端右上角大多数情况下会短暂闪现一个灰色状态点。终端内容和连接本身保持正常，灰点来自 pane 状态伪元素，并非 Canvas 残留像素。

## 预防的回归

- 健康连接且已有稳定 presentation 帧时，键盘收起全过程不得显示右上角状态点。
- 键盘打开期间不得发送改变 cols/rows 的终端 resize。
- 键盘 inset、移动快捷键栏和 Canvas pan 在收起后恢复。
- viewport/orientation 变化只复用当前内存终端状态，不触发历史 replay，不暴露不安全中间帧。
- 页面始终只有一条 Unified 物理 WebSocket，最终 Canvas 非空。

## 修复前基线

- 2026-09-04 使用当前工作区资源、真实 `debug@cloud.lazycat.lightos.entry` Provider/agent/PTY 和移动 Chrome 运行，产物为 `artifacts/2026-09-04T06-46-09-867Z/`。新增断言按预期失败：94 个键盘收起逐帧样本中有 6 帧状态点可见；这些帧均为 `connection=open`、`hasPresentedFrame=true`、`data-render-recovery=true`，伪元素计算后 opacity 为 `0.85`、颜色为 `rgb(148, 163, 184)`。同期 hold 可见且 `unsafe=0`，证明问题是状态点误显示而非 Canvas 中间帧或连接故障。
- 前一次 `artifacts/2026-09-04T06-43-23-863Z/` 在进入键盘步骤前等待 desktop active pane `connection=open` 超时；截图显示终端内容已呈现，但第二窗口接入后该 pane 停在 `reconnecting`。该次属于测试机瞬时连接前置失败，不计作产品基线。
- 2026-09-04 全量编排审计发现 `test-all.sh` 未注入本场景要求的 iPhone UA，`artifacts/2026-09-04T09-14-09-050Z/` 在平台前置断言停止；按 README 命令单独运行后于 `artifacts/2026-09-04T09-15-01-301Z/` 通过。
- 随后的连续运行 `artifacts/2026-09-04T09-17-28-118Z/` 在 viewport 动作前的 desktop -> mobile 共享 marker 超时。trace 证明该失败属于 resize pending 跨 reconnect 后阻塞输入，由场景 01 承接；共享 marker 是本场景重复且过宽的依赖，不应继续作为 viewport 合同。
- 本轮首次修复后运行 `artifacts/2026-09-04T09-47-29-434Z/` 再次命中旧的 `connection=open` 前置竞态：截图已显示移动终端 prompt，trace 中 active pane 已有 `renderReady=true` 且后续 resize owner 响应已完成，但 resume deadline 先把展示属性置为 `reconnecting`，导致用例等待内部瞬时状态满 60 秒而完全没有执行用户输入。该结果与本 README 早期记录的 `06-43-23-863Z` 同类，判定为过时前置断言。
- 改为用户输入后，`artifacts/2026-09-04T09-52-15-815Z/` 中 marker 已真实回显，后续两个 resize claim/ACK 成功，active pane 为 `renderReady=true`、`hasPresentedFrame=true`、`data-connection-retrying=false`，状态点不可见；仅非权威展示属性 `data-connection=reconnecting` 未回写为 open。测试因此改为首尾两次 PTY 回显、活跃 Unified socket、稳定 presentation 和状态点不可见的组合合同，不把无用户影响的展示字符串当作传输失败，也不会掩盖不可输入、无法 resize 或 socket 失活。
- `artifacts/2026-09-04T09-55-58-380Z/` 的最终 marker 超时发生时，连接为 `open`、presentation 稳定且所有 viewport resize ACK 已完成；原因是新增验证只 tap 了 host、未重新聚焦已在键盘收起步骤 blur 的 helper textarea。用例补齐与首次输入相同的显式 focus 后再发送最终 marker，不改变等待或产品断言。

## 已确认根因

键盘收起会恢复 visualViewport 高度并进入有界 resize suppression/geometry claim 阶段。此时 ResizeObserver 仍会安排 presentation 检查；presentation 在等待 viewport geometry 或最终 resize 收敛时使用通用 `presentationRetryPending` 调度器。`presentation_view.js` 将该内部 timer pending 状态映射为 `data-render-recovery="true"`，而 `style.css` 又无条件把该属性显示为右上角灰点，导致正常 viewport 协调被误呈现为故障恢复。

## 实施方案

保留 `data-render-recovery` 作为内部诊断状态，但不再用它控制 pane 状态点可见性。状态点继续覆盖首帧未产生、连接中、真实重连和明确网络/连接错误；不修改 viewport、resize、presentation 或 transport 状态机。

修改文件：

- `runtime/static/style.css`：从状态点 opacity 和灰色背景选择器中移除 `[data-render-recovery="true"]`。
- `spec-tests/terminal/viewport/test.mjs`：从键盘 blur 前逐帧采样状态点计算样式，并拒绝健康已呈现终端上的可见状态点。
- `spec-tests/terminal/viewport/README.md`：记录场景、基线、根因、方案和验证结果。
- `spec-tests/terminal/output/README.md`：同步状态点的跨场景显示契约。
- 当前测试边界调整：使用 mobile 自身点击、首尾输入、真实 PTY 回显、presentation/状态点和 Unified socket 验证可用，移除重复的 desktop -> mobile 输出同步与瞬时 `connection=open` 前置；`test-all.sh` 通过场景 profile 自动注入 iPhone UA。

## 验证预期

- 键盘收起采样中允许内部 `data-render-recovery="true"`，但健康连接且已有稳定帧时 `::after` 的计算后 opacity 必须始终为 `0`。
- keyboard inset 为 `0px`、`mobile-keyboard-visible` 被移除、快捷键栏 transform 清空。
- orientation/fold 后 presentation unsafe 样本为零，至少产生两次 current-device claim。
- 最终桌面和移动 Canvas 均有非透明像素；移动页面 Unified socket 数量不增加；API、console error 和 `pageerror` 为零。

## 验证结果

2026-09-04 修复后验证：

- 真实场景通过，产物为 `artifacts/2026-09-04T06-47-07-703Z/`。键盘收起阶段共采样 93 帧，内部 `data-render-recovery=true` 仍出现 6 帧，但健康已呈现终端的可见状态点为 0；`unsafe=0`。
- orientation/fold 阶段共采样 228 帧，内部 recovery 15 帧，可见状态点 0，`unsafe=0`；产生 4 次 current-device claim。
- 最终 Canvas 非透明采样为 desktop `20326`、mobile `21420`；移动页面 Unified WebSocket 前后均为 `created=1`、`active=1`。
- `node --test tests/terminal_viewport_controller_test.mjs tests/terminal_ime_controller_test.mjs tests/terminal_presentation_controller_test.mjs tests/terminal_presentation_view_test.mjs tests/terminal_resize_controller_test.mjs tests/terminal_resize_scheduler_test.mjs`：60 项通过。
- `go test ./... -run TestRuntimeConnectionStateDiagnosticsAndOneShotRevisionGuard -count=1`：通过，连接状态点 CSS guard 保持有效。
- `git diff --check`：通过。
- 2026-09-04 本次输入锁删除回归首次运行未注入 `WEBSHELL_MOBILE_USER_AGENT`，在进入场景动作前被平台前置断言拒绝，产物为 `artifacts/2026-09-04T07-10-37-430Z/`；这是运行命令缺少 README 必需变量，不是产品失败。
- 使用下方完整命令重跑通过，产物为 `artifacts/2026-09-04T07-11-27-285Z/`；移动键盘 `inputViewportLock`、键盘展开/收起、最终 Canvas 和 Unified 连接均符合原场景断言。
- 本轮更新后的用户结果合同于 `artifacts/2026-09-04T09-57-38-925Z/` 通过：viewport 前后两个移动端 marker 均由真实 PTY 回显；键盘打开 inset 为 `300px`，收起恢复 `0px`；键盘阶段 90 帧、orientation/fold 阶段 234 帧均 `unsafe=0`、可见健康状态点为 0。共观察到 4 个 current-device claim，最终 desktop/mobile Canvas 非透明采样分别为 `20326`/`21420`，Unified socket 前后均为 `created=1`、`active=1`。
- 最终 16 场景回归产物 `artifacts/2026-09-04T11-12-42-657Z/` 再次通过首尾 PTY 输入、iPhone viewport、状态点、Canvas、claim 和 socket 门禁。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 \
WEBSHELL_MOBILE_USER_AGENT="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" \
WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/terminal/viewport/test.mjs
```

测试连接 `debug123` 的真实 Provider、persistent agent 和 PTY，并把当前工作区版本化前端资源映射到页面。账号和认证配置由 `spec-tests/.env` 或运行环境提供。

## 产物与失败诊断

运行产物写入 `spec-tests/terminal/viewport/artifacts/<run-id>/`，包括事件 JSONL、截图、trace、错误摘要和终端时间线。键盘收起失败摘要会包含首批可见状态点样本，其中记录 connection、renderReady、hasPresentedFrame、renderRecovery、伪元素 opacity 和 backgroundColor。

## 已知限制

- Chrome 通过 iPhone User-Agent 和 synthetic visualViewport 进入 iOS 分支，能够自动验证浏览器布局、伪元素和完整真实终端链路，但不等价于 Safari/WebView 的原生键盘动画时序。
- 本轮未运行原生 iOS/Android 设备人工观感验证；自动化断言固定的是用户可见状态点不出现这一跨浏览器不变量。
