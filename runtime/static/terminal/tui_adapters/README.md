# TUI 适配器

## 职责与边界

本目录按工具隔离 fullscreen TUI 的身份识别和手势适配。公共机械逻辑只能位于 `common/`；Claude、Codex、opencode、herdr、pi、Grok 的身份判断和专用事件所有权必须留在各自目录，禁止重新并入通用 mouse tracking。

Codex 的主题适配同样独立位于 `codex/`：提供进程识别与背景颜色映射，渲染 owner 通过注入接口消费，不把工具混色规则放进全局运行时或通用 renderer。Codex fullscreen 交互仅在精确身份且终端启用鼠标追踪时接管事件。

适配器不拥有 session、连接、历史或渲染状态，只通过调用方注入的读状态和动作工作。Ghostty mouse mode、协议编码和通用 listener 由 `terminal/mouse/` 维护；适配器只能调用其 `hasTracking()`、`claimEvent()`、`sendWheel()` 和 `sendClick()` 公开能力。键盘层已认领的事件和 IME 放行的第一下页面焦点交接不得再 `preventDefault` 或发送鼠标字节；本地选择手势不得向 PTY 发送残缺 press/move/release。Grok 的长按选区和桌面拖选必须走 WebShell 本地选择与右键菜单，不得把选区拖动手势交给 Grok mouse protocol。

## 公开入口与生命周期

运行时外部只能从 `terminal/tui_adapters/index.js` 导入各工具 API。每个 adapter 的 listener、long-press timer、selection auto-scroll 和事件所有权都必须通过注入的 cleanup 随 session 销毁；迟到 timer 不能作用于新 session。

## 目录

- `index.js`：聚合公开入口。
- `installation_controller.js`：把 session 与各工具公开 adapter、选择/鼠标/IME/resize 动作连接起来；不拥有身份判断、手势状态或终端生命周期。
- `common/`：无工具身份判断的通用触摸状态机，以及触摸、右键和桌面拖选 DOM adapter。
- `claude/`：Claude fullscreen 触摸、右键和桌面本地选择。
- `opencode/`：opencode fullscreen 触摸、右键和桌面本地选择。
- `herdr/`：herdr fullscreen 触摸适配。
- `pi/`：pi fullscreen 触摸适配。
- `grok/`：Grok fullscreen 触摸、右键和桌面本地选择。
- `codex/`：Codex fullscreen 触摸、右键、桌面本地选择，以及输入区域派生背景跟随 WebShell 主题。

相关 Node/Go 行为测试按工具分布在仓库根目录。最小回归需同时覆盖目标 TUI 和一个不匹配 TUI，确认事件所有权不会跨工具泄漏。

触摸依赖统一注入 `selectStringAtCell(cell)` 和 `applySelection(start, end, options)`：前者委托 selection owner 开始连续字符串选择，后者传递初始范围以稳定拖动扩选。断词、宽字符和选区归一化仍只由 `terminal/selection/` 负责；各工具的长按候选判断、滚动和鼠标协议归属不变。
