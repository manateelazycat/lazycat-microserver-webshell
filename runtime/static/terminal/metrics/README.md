# 终端 metrics 模块

## 职责

`metrics/` 负责终端字体 metrics 刷新稳定化、live pane 的字体/scrollback/mobile-pixel-scroll 选项适配和 workspace 尺寸估算/query。它通过注入的 renderer、presentation、resize、history 适配和 session 查询工作，不拥有这些模块的全局状态。

## 公开入口

外部只能从 `index.js` 导入 `createTerminalMetricsController()`。公开方法包括 `refresh()`、`applyFontFamily()`、`applyFontSize()`、`applyLineHeight()`、`applyScrollback()`、`applyScrollbackChange()`、`applyMobilePixelScroll()`、`estimatedSizeForElement()`、`sizeQuery()` 和幂等 `dispose()`。

## 状态所有权与生命周期

controller 唯一持有 metrics retry 的 RAF/timer 集合，并以 session generation 拒绝迟到回调；session cleanup 会取消该 session 的 timer。已有稳定画面的字号和行高变化在 option/metrics 更新前向 resize owner 申请 metrics live geometry，在 RAF/timeout 稳定化期间直接更新当前 Canvas，最后由 resize owner 提交一次最终尺寸。字体族资源加载仍使用 presentation hold；若它与已有 live geometry 重叠，则加入 metrics source，不能隐藏正在显示的 Canvas。scrollback 变化通过显式 history callback 只通知 `client:` IndexedDB 兼容 owner，普通容器不创建浏览器历史任务。`dispose()` 取消所有资源，之后不再修改 session。

## 文件清单

- `index.js`：唯一公开入口。
- `metrics_controller.js`：live option 适配、metrics 刷新、scrollback 应用、尺寸估算和资源清理。

## 依赖、边界与验证

依赖方向为 app -> metrics -> renderer/presentation/resize/history 注入 API；模块不建立 WebSocket，不执行 history replay，不清空 Canvas，不实现 transport、session 或设置持久化。行为测试为 `terminal_metrics_controller_test.mjs`，静态/资源 guard 位于 `runtime_shortcuts_test.go`；真实字号/行高回归为 `spec-tests/terminal/geometry-jitter`。最小回归需覆盖字号/行高 live geometry、字体族原子刷新、scrollback/mobile option 适配、尺寸 fallback、session cleanup 和 dispose。
