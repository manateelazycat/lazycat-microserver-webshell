# 终端几何变化抖动回归

规格：[REQ](../../../spec/terminal/geometry-jitter/REQ.md) · [AC](../../../spec/terminal/geometry-jitter/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/geometry-jitter`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / mobile / responsive / lifecycle
- 真实依赖：真实 Provider、persistent agent、PTY、Unified WebSocket、Ghostty WASM、真实 Chrome Canvas
- 相关模块和源码入口：`runtime/static/terminal/metrics/`、`runtime/static/terminal/resize/`、`runtime/static/terminal/rendering/`、`runtime/static/settings/`

## 触发条件

开始字号/行距采样前，先等待两个页面配置的字体均加载并注册、终端呈现就绪。2026-09-07 全量曾将约 4.9 秒的后台字体加载混入移动 Zoom 阶段；字体加载后的正常原子刷新触发了本场景的 live 断言。补齐这个前置后，原断言不变，单项复测在 34.338 秒通过。原因与证据见 [复测记录](../../../reports/geometry-and-client-recheck.md)。

终端已有稳定画面后，通过桌面快捷键或移动快捷键调整字号，通过设置中的真实行间距输入调整并恢复行高，同时执行浏览器 viewport resize 和 tab 激活切换。

## 用户可见问题

字号和行高变化过去会显示旧的 hold Canvas，待字体度量、resize ACK 和 full render 完成后才切回真实 Canvas，视觉上与现在的分屏/窗口 live reflow 不一致。错误地全面移除原子门禁又可能让首次加载、历史 replay 或重连的中间帧重新可见。

## 预防的回归

- 已提交终端上的字号、行高变化必须始终显示当前 live Canvas，顶部/左侧锚点稳定，hold Canvas 全程隐藏，最终几何收敛。
- 字体几何调整只能进入 resize owner 的显式 live geometry，不能由 Ghostty option setter 额外发送 resize，也不能为重试不断分配新 epoch。
- viewport resize 继续采用桌面 live geometry；tab 激活、首次加载、history replay、重连和 identity 变化仍保持原子提交。
- 移动端 `Zoom+`/`Zoom-` 同样不能重新显示 hold Canvas。

## 修复前基线

2026-09-04 使用本地 `runtime/static`、真实 `debug@cloud.lazycat.lightos.entry`、桌面/移动 Chrome 和真实 PTY/Unified WebSocket 运行，产物为 `artifacts/2026-09-04T03-43-37-909Z/`。用例在桌面字号阶段按预期失败：60 个有效样本中多次出现 `holdHidden=false`、`liveVisibility=hidden`、`renderReady=false`；Ghostty setter 一度生成 `1584×1035` 的 live Canvas，随后才经 hold 切回 `1440×851`。截图、trace、逐帧几何和 terminal timeline 均已保存。

## 已确认根因

`terminal/metrics/metrics_controller.js` 在字号 setter 前显式 `beginHold()`，随后 `refresh()` 又无条件开启 hold，并把真实 Canvas 隐藏到普通 resize ACK/full render 完成。行高虽然没有直接改 Ghostty option，但仍走普通原子 resize；此外行高 PATCH 成功后，settings controller 会无条件重新注册并刷新未变化的字体族，于 live fit 之后再次制造 hold。

## 实施方案

metrics controller 在修改字号或重新测量行高前，为当前可见、replay 已提交的 session 申请独立 metrics live source；renderer metrics 刷新后通过 resize owner 的 session 级 update 做本地 fit，在既有 RAF/80ms/240ms 稳定检查完成后结束 source 并提交最终 `claim:true`。Ghostty option setter 的 `onResize` 在 live 期间不自行发送控制帧。

resize controller 分别维护 interactive 与 metrics source；二者重叠时，任一方结束都不能提前退出 live geometry，只有所有 source 结束后才提交最新 target，ACK 后才完成事务。不可见或尚未 replay commit 的 session 继续走原子路径。行高 PATCH 响应跳过未变化字体资源的重复注册，但字体选择、上传、删除和初始加载不变。

## 验证预期

- 字号和行高采样期间 `holdHidden=true`、`liveVisibility=visible`、`renderReady=true`。
- live Canvas 与 host 的顶部/左侧偏差不超过 1px，最终宽高收敛，Canvas backing size 确实发生变化。
- 操作后不得出现本地 epoch 覆盖导致的 stale-ACK/retry 风暴或 `presentation_retry_exhausted`，Unified socket 不被替换；多设备竞争产生且被 fence 拒绝的旧 ACK 继续按既有场景记录。
- 原有 viewport live geometry 与 tab 原子安全断言继续通过。

## 验证结果

2026-09-04 最终代码的真实运行通过，产物为 `artifacts/2026-09-04T03-57-16-152Z/`：

- 桌面字号 68 个样本、行高修改/恢复 107 个样本、移动 `Zoom+`/`Zoom-` 99 个样本，三组 `visibleHold=0`、不安全 live 样本均为 0。
- 三组操作都捕获到至少 2 个真实 Canvas 几何，证明不是静态旧帧；最终 live Canvas 顶部/左侧锚定且宽高收敛。
- tab 激活仍捕获到 12 个安全 hold 样本，证明本次没有把 replay/激活等原子 presentation 全面改成 live。
- 相关 Node 测试：`node --test tests/settings_controller_test.mjs tests/terminal_metrics_controller_test.mjs tests/terminal_resize_controller_test.mjs tests/terminal_presentation_controller_test.mjs`，46/46 通过。
- 完整 Node 行为测试：`node --test tests/*_test.mjs`，422/422 通过；相关 Go/架构 guard 定向运行通过。
- 真实 `terminal/output`、`terminal/overview-preview` 和 `workspace/split-divider` 分别在 `spec-tests/terminal/output/artifacts/2026-09-04T03-52-47-179Z/`、`spec-tests/terminal/overview-preview/artifacts/2026-09-04T03-54-36-618Z/`、`spec-tests/workspace/split-divider/artifacts/2026-09-04T03-53-21-519Z/` 通过，确认 replay/大输出原子提交、最终预览持久化和分屏 live resize 没有回归。
- 移动端 DPR=3 重跑 `artifacts/2026-09-04T04-01-01-122Z/` 通过：字号、行高、移动 Zoom 的 `visibleHold=0`，移动 live Canvas backing/CSS 比例始终为 3，tab 激活仍有 14 个安全 hold 样本。第一次 DPR=3 尝试 `artifacts/2026-09-04T03-59-13-171Z/` 未进入操作阶段：desktop 已有稳定 presentation、mobile 正常，但通用双窗口运行器的 desktop 连接标签停在 `reconnecting`，旧前置选择器超时；原样重跑后通过，因此记为环境/多设备状态标签波动，不计产品失败。
- 本轮完整回归 `artifacts/2026-09-04T10-30-26-693Z/` 再次命中同一旧前置：desktop active pane 已 `renderReady=true`、`hasPresentedFrame=true`、Canvas 非空，mobile 同 pane 为 `connection=open`，desktop 仅被 resume deadline 留下 `data-connection=reconnecting` 且 `data-connection-retrying=false`。用例尚未执行任何字号/行高/viewport 动作，判定为过时展示属性断言，不是几何产品失败。

当前测试边界调整为等待 active terminal host 可见，并同时要求稳定 presentation 与非空 Canvas；之后原有字号、行高、移动 Zoom、viewport、tab 激活的逐帧 live/hold/anchor/收敛断言全部保留。这样不会把真实未就绪页面放行，也不再把非权威的 `data-connection` 展示字符串当成几何失败。

## 运行命令和环境变量

```bash
npm run build
WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" TEST_FOREGROUND=0 \
  node spec-tests/run-playwright.mjs spec-tests/terminal/geometry-jitter/test.mjs
```

## 产物与失败诊断

运行器将 screenshot、trace、JSONL、presentation probe 和 terminal timeline 写入 `artifacts/<run-id>/`。用例还记录逐帧 host/live/hold 几何、resize trace 和 presentation trace。失败时必须联合这些产物确认是 live Canvas 被隐藏、字体 fit 未收敛、服务端 resize 事务未完成还是测试环境错误。

## 已知限制

本场景使用真实 headless Chrome 和真实终端链路，不替代用户设备上的前台视觉判断。字体族切换不在本次 live 范围内，因为新字体资源加载与 fallback 替换仍可能需要原子保护。

本轮前置修正后独立通过，并在最终全量的 `artifacts/2026-09-04T11-14-53-414Z/` 再次通过字号、行高、移动 Zoom、viewport、tab 激活和逐帧 live/hold 几何门禁。当前 `node --test tests/*_test.mjs` 为 437/437 通过，`go test ./... -count=1` 全部通过；此前记录的 Canvas residue guard 阻塞已经过时。
