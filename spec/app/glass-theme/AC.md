# 场景 1：从主题列表末尾使用深色玻璃主题
ID: SC-OMARCHY-GLASS-THEME
Profile: draft
Gate: required
Given 用户在桌面设置或移动端主题选择器查看主题
When 滚动到末尾并选择 Omarchy Glass
Then 原有主题顺序保持不变，新主题位于末尾，工作区呈现深色半透明表面和蓝紫、青绿色高亮
And 终端文字、光标、选择与界面操作清晰可见，输入和会话继续可用

# 场景 2：保存选择和恢复普通主题
ID: SC-OMARCHY-GLASS-RESTORE
Profile: draft
Gate: required
Given 用户已选择 Omarchy Glass
When 刷新页面
Then 恢复该主题，实例和终端会话沿用原有恢复行为
When 切换至任意原有主题
Then 半透明主题的背景及透明度不再影响页面，恢复所选主题的原有外观
