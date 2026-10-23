# 场景 1：字体大小设置显示当前实际字号
ID: SC-TERMINAL-FONT-SIZE-SETTINGS-CURRENT
Profile: draft
Gate: required
Given 用户已通过现有快捷键将终端字号调整为非默认值
When 用户打开终端设置，并在面板打开期间再次使用字号快捷键
Then 光标样式模块下方的字体大小输入框显示当前实际字号，并同步跟随快捷键的调整
And 字体大小标题与说明之间的留白紧凑，说明及输入控件清晰可读

# 场景 2：数字输入及增减操作生效并保留
ID: SC-TERMINAL-FONT-SIZE-SETTINGS-APPLY
Profile: draft
Gate: required
Given 用户在终端设置中打开字体大小设置，已有终端包含未提交输入
When 用户输入有效字号或使用上下增减按钮，随后重新打开设置、新建终端并刷新页面
Then 已有终端即时使用所选字号，新建终端及刷新后的设置也保留该字号
And 未提交输入和会话内容保持完整，终端可以继续正常交互
And 字号、行间距和历史行数旁不显示圆形恢复默认按钮，数字输入和上下增减仍可用

# 场景 3：无效字号不改变当前字体大小
ID: SC-TERMINAL-FONT-SIZE-SETTINGS-INVALID
Profile: draft
Gate: required
Given 用户正在使用有效的终端字号
When 用户在字体大小输入框提交空值、非整数或范围外的值
Then 终端字号保持原值，输入框恢复当前字号并显示错误反馈
