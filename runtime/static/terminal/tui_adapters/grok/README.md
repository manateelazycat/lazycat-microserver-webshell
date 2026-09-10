# Grok Fullscreen 适配

本模块只负责精确 Grok 身份下的 fullscreen 触摸、鼠标右键和桌面本地选择事件所有权，不负责通用 mouse tracking、终端状态或其他 TUI。外部通过 `grok/index.js` 导入。

触摸手势机械逻辑来自 `../common/index.js`；Grok 身份判断、右键菜单和桌面本地选择必须留在本目录，禁止并入 Claude 或其他工具 adapter，也禁止重新并入通用 mouse tracking。进入 Grok 后的第一下轻触必须把页面焦点交接留给 IME，双击才能直接展开键盘；这一下不得发给 Grok 当 click。listener、timer 和临时手势状态通过调用方注入 cleanup 随 session 销毁。

文件包括触摸候选与 adapter、context menu adapter、desktop selection adapter。相关回归必须同时覆盖 Grok 命中路径，以及 Claude、opencode、herdr、pi 和普通终端的排除路径。
