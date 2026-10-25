# Claude Fullscreen 适配

本模块只负责精确 Claude 身份下的 fullscreen 触摸、鼠标右键和桌面本地选择事件所有权，不负责通用 mouse tracking、终端状态或其他 TUI。外部通过 `claude/index.js` 导入。

文件包括触摸状态机与 adapter、context menu adapter、desktop selection adapter。listener、timer 和临时手势状态通过调用方注入 cleanup 随 session 销毁。相关 guard 为 Claude fullscreen touch/context menu/desktop selection 测试；必须回归 Claude default、Codex 排除路径，以及 Grok 不得误入 Claude adapter。

fullscreen 长按通过注入的 `selectStringAtCell()` 使用 selection owner 的连续字符串范围，拖动时把初始范围传回 `applySelection()` 保留已选内容；结束/取消释放范围。文本读取和边界算法不放进 Claude adapter。手工确认中文短句/英文单词长按、细微抖动、拖动扩选及松手后手柄调整，并保留滚动和键盘焦点交接。
