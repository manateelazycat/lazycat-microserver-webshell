# 终端长截图模块

## 职责与边界

本目录归档现有长截图实现，负责冻结并校验终端几何、分段读取行、绘制图片和下载事务。它不修改 session、历史、resize 或 Canvas presentation，不得为了截图触发历史 replay 或改变终端可见状态。

背景绘制复用 renderer 提供的 `webshellBackgroundRGBToCSS()`，保证工具主题适配与当前画面一致；前景仍走普通颜色映射。截图期间背景映射发生切换时中止事务，不拼接不同适配状态的图片。

## 公开入口与生命周期

外部只能从 `terminal/screenshot/index.js` 导入 API。截图事务通过创建时的 terminal/renderer geometry 校验一致性；尺寸、renderer 或 session 变化时必须中止。模块不注册长期 listener/timer，临时 Canvas、对象 URL 和异步事务由调用方及实现现有 finally 路径清理。

## 文件与验证

- `index.js`：唯一公开入口。
- `terminal_long_screenshot.js`：几何快照、分段计划、行绘制和截图事务。

行为测试为 `terminal_long_screenshot_test.mjs`，静态 guard 为 `TestRuntimeTerminalLongScreenshotContract`。最小回归是滚动历史后生成长截图，并在截图过程中触发 resize，确认旧事务拒绝提交且终端画面不变化。
