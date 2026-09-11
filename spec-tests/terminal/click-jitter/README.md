# 同设备点击稳定性

规格：[REQ](../../../spec/terminal/click-jitter/REQ.md) · [AC](../../../spec/terminal/click-jitter/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/click-jitter`（产品根目录）。

## 场景

在同一个桌面终端 pane 上连续点击多次，并记录 resize 控制帧、Canvas 尺寸和 presentation 状态。

## 预防的问题

稳定终端几何下，点击不得重复发送相同的尺寸 claim，也不得因为 pane 激活、鼠标输入或焦点事件触发 viewport 重置、整帧呈现或把已有画面短暂隐藏。用例同时检查 Canvas 始终有有效尺寸和可见像素，并拒绝 `renderReady=false` 与已有画面同时出现的中间状态。
