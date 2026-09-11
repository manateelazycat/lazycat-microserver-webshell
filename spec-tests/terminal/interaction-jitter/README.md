# 终端交互抖动回归

规格：[REQ](../../../spec/terminal/interaction-jitter/REQ.md) · [AC](../../../spec/terminal/interaction-jitter/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/interaction-jitter`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / responsive
- 真实依赖：真实 Provider、persistent agent、PTY、Unified WebSocket、Chrome RAF/Canvas
- 相关模块和源码入口：`runtime/static/terminal/interaction/`、`selection/`、`input/`、`resize/`、`rendering/`

## 触发条件

稳定终端上点击、输入唯一 marker 并拖拽选区，同时逐 RAF 采样页面、host、Canvas、textarea 和 hold 状态。

## 用户可见问题

普通交互可能意外触发 fit/hold，造成终端垂直位移、Canvas 抖动或已提交画面短暂隐藏。

## 预防的回归

- 输入 marker 必须由真实 PTY 回显。
- 点击/输入/选择期间 host、Canvas、textarea/backing 几何稳定。
- 不进入 presentation hold，不暴露 `renderReady=false` 的不安全帧。

## 修复前基线

旧前置要求 `data-connection=open`；本轮统一审计确认它不是交互场景的权威健康状态。

2026-09-06 全量回归在 `artifacts/2026-09-06T15-10-05-377Z/` 失败：采样开始时桌面 host 为 1440x862，Canvas 为 1440x945（144x45 网格），首次点击后变为 1440x861（144x41）。trace 与 terminal timeline 显示初始化已经发生 `remote_owner_observed` / `presentation_wait_current_device_claim`，点击提交了 `claim:true`，matching resize ACK 后才进入本设备尺寸。截图确认终端有正常输出而非黑屏。该采样把双窗口初始化后的首次设备接管混入了“同设备稳定交互”。原补丁前四个业务文件的独立 Vite 构建和候选构建各进行一次同命令对照，均通过，说明前置受初始化/owner 时序影响，不能用一次重跑通过消除该前置缺口。

## 已确认根因

交互稳定性应由真实输入、逐帧几何和 presentation 状态判断，而非 resume deadline 可能改写的展示字符串。

## 实施方案

前置改为 host 可见、稳定 presentation 和非空 Canvas；所有逐帧变化、hold 和 PTY 断言保持不变。

2026-09-06 完善同设备前置：先在桌面窗口执行一次明确设备接管，再等待当前页面最后发送的 resize 几何与 live Canvas backing 匹配、ready/hasPresentedFrame 为 true、hold 隐藏且 Canvas 不超出 host，才安装采样器。移除原本不能证明几何收敛的 600ms 固定等待。被测点击、输入、选择及 geometry/unsafe/hold 零变化断言全部保留；首次设备接管和跨设备 resize 继续由场景 01 验证。本项是测试前置修正，不宣称修复了新的产品 Bug。

## 验证预期

marker 回显，几何 changes/unsafe/hold transitions 均为 0，无 fatal error。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/terminal/interaction-jitter/test.mjs
```

## 产物与失败诊断

产物位于 `artifacts/<run-id>/`；事件日志额外保存 RAF samples、projection、resize/presentation trace。

## 已知限制

主要覆盖 desktop 鼠标选择；移动触摸选择由对应 selection/IME 场景覆盖。

## 验证结果

2026-09-06：补充本设备接管与实际几何收敛前置后，`artifacts/2026-09-06T15-15-56-442Z/` 通过原有逐帧 geometry/unsafe/hold 门槛和真实输入回显。没有放宽被测交互断言或增加固定等待。

最终 16 场景回归产物 `artifacts/2026-09-04T11-14-34-866Z/` 通过真实 marker、逐帧 geometry、零 unsafe/hold transition 和 fatal 门禁。
