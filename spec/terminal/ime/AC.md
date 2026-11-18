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

# 场景 3：Windows 微软拼音可启动并连续提交中文
ID: SC-WINDOWS-MICROSOFT-PINYIN
Profile: draft
Gate: required
Given 用户在 Windows 的懒猫客户端、Microsoft Edge 或 Google Chrome 中打开可交互的真实终端，并启用系统自带微软拼音中文模式
When 用户点击终端后输入拼音，使用退格修改拼音、方向键选择候选，再用空格或回车确认中文
Then 正常显示和编辑中文候选，确认的中文仅进入终端一次，不出现按键无反应、提前输入拼音或误发终端命令
And 候选编辑期间不会触发同键位的应用快捷键，取消候选不会提交未确认文字
When 用户继续输入下一组中文、切换中英文，或在终端持续输出时再次输入中文
Then 输入持续可用，无需重新聚焦或切换到其他输入法，已确认文本不重复且不丢失
