# 场景 1：浏览器文本组合与编辑正确提交
ID: SC-TERMINAL-IME
Profile: standard
Gate: required
Given 终端输入区域已获得焦点
When 用户组合输入文本、插入空格、连续退格并粘贴文本
Then 已确认文本按编辑后的内容提交，不重复且不丢失

# 场景 2：豆包英文候选确认后仍可输入空格
ID: SC-ANDROID-DOUBAO-SPACE
Profile: draft
Gate: required
Given 用户在 Android 豆包输入法英文模式下打开可交互的真实终端
When 用户点击键盘输入 cd，再用回车确认候选并点击空格
Then 终端只收到一次 cd，后续每次空格均正常输入
And 等待一段时间后再次点击空格仍有效，不需要先输入其他文字或重新聚焦
When 用户改用空格确认 cd，或切换中文模式确认候选
Then 候选及其后续输入保持正确，不丢失空格也不重复提交候选
