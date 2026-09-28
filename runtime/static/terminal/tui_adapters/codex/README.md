# Codex 主题与全屏交互适配

## 职责与入口

通过 `index.js` 暴露 Codex 精确进程识别、主题适配与 fullscreen 交互 adapter。主题适配根据注入的前台进程信息、主题目录和当前背景，提供背景 RGB 的精确映射；实际绘制和刷新由 rendering owner 完成。fullscreen 适配只在 Codex 身份且终端启用鼠标追踪时接管触控、右键和桌面拖选；手势机械逻辑复用 `../common/`，协议发送和 WebShell 选区经调用方注入。

## 规则与边界

识别使用既有 activity 的可执行文件名和官方 Node 入口，不根据 OSC 标题、页面文字或命令参数中出现的 `codex` 猜测。进程信息沿用现有 activity 刷新周期；观察到进程变化后通知 rendering owner 撤销或启用映射。未知进程不启用适配。

npm 安装后的入口可能是 `node /usr/sbin/codex`、`node /home/用户/.local/bin/codex` 等符号链接路径，activity 不负责解析链接。因此 JS 启动器的脚本位置同时接受准确的 `codex` 可执行名与 `@openai/codex/bin/codex.js` 包路径；不扫描其他参数。已在 debug 实例的真实 activity 中观察到 `command=node`、`command_line=node /usr/sbin/codex`，只接受包路径会漏掉该会话。

颜色规则对应 Codex `rust-v0.154.0` 的 `tui/src/style.rs::user_message_bg_rgb`：亮度大于 128 时混入 4% 黑色，否则混入 12% 白色；使用 f32 运算和截断。只精确匹配所有已知主题背景派生出的 RGB，目标为当前主题的派生背景。目标主题和 session 基准变化时更新 WeakMap 缓存，不在每个 cell 上计算混色或遍历主题目录。匹配所有主题避免把浏览器创建时间当作 Codex 启动时间，也支持刷新/重连恢复旧 RGB。

映射仅用于背景，不改变前景文字、选择高亮或终端原始数据。滚动、合并行背景与 cell seam 使用同一映射。Codex 内与输入框使用同色的背景一起适配；无法仅凭 RGB 区分其中的自定义区域。WebShell 默认提供 truecolor；主动降级到 256 色、未知主题背景或未来 Codex 改变混色规则时，不做近似颜色替换。

## 验证

构建前端后按 `spec/terminal/theme-following/` 手工验收：运行真实 Codex 并保留未提交文字，连续切换深色、浅色及不同色调主题，检查输入框和同色背景；先换主题再启动，刷新页面/重连后再换主题；滚动和选中文本；退出 Codex 后以及另一个非 Codex 会话显示同 RGB，确认没有新增改色。确认进程信息已由既有 activity 更新。无需新增自动化场景。

按 `spec/terminal/codex-fullscreen-interaction/` 在真实 Codex 全屏会话验收：手机上下滑动浏览内容，长按后调整 WebShell 选区并打开操作栏；桌面点击仍有效、拖选归 WebShell、右键只出现 WebShell 菜单。再检查 Codex 非全屏界面和普通终端不受影响。
