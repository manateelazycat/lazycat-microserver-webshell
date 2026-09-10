# Claude Fullscreen 适配

本模块只负责精确 Claude 身份下的 fullscreen 触摸、鼠标右键和桌面本地选择事件所有权，不负责通用 mouse tracking、终端状态或其他 TUI。外部通过 `claude/index.js` 导入。

文件包括触摸状态机与 adapter、context menu adapter、desktop selection adapter。listener、timer 和临时手势状态通过调用方注入 cleanup 随 session 销毁。相关 guard 为 Claude fullscreen touch/context menu/desktop selection 测试；必须回归 Claude default、Codex 排除路径，以及 Grok 不得误入 Claude adapter。
