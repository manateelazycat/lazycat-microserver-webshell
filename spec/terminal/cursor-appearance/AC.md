# 场景 1：块状光标覆盖文字后仍然可读
ID: SC-TERMINAL-CURSOR-TEXT-VISIBLE
Profile: draft
Gate: required
Given 终端中已有普通文字、彩色或反色文字、中文、emoji 及组合字符，并使用块状光标
When 用户将光标移动到这些文字上，并切换深色和浅色主题
Then 光标覆盖区域内的文字保持清晰可辨，光标移开后文字恢复原配色
And 光标与选区重叠时，覆盖区域内的文字仍清晰可辨，相邻文字保持完整

# 场景 2：所选光标样式立即应用并保留
ID: SC-TERMINAL-CURSOR-STYLE-PERSISTED
Profile: draft
Gate: required
Given 用户已打开多个终端，其中包含未提交输入
When 用户在终端设置的字体模块下方展开文本下拉选项栏，选择块状、竖线或下划线光标，保存成功后新建终端并刷新页面
Then 已打开的终端立即使用所选样式，新建终端及刷新后的终端也使用所选样式
And 未提交输入和会话内容保持完整，终端可以继续正常交互

# 场景 3：保存失败恢复原光标样式
ID: SC-TERMINAL-CURSOR-STYLE-SAVE-FAILURE
Profile: draft
Gate: required
Given 用户已有保存成功的光标样式，且设置保存服务当前不可用
When 用户在终端设置中选择另一种光标样式
Then 页面提示保存失败，设置选项和已打开终端恢复到原光标样式
And 未提交输入及会话内容保持完整
