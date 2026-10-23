# 场景 1：按设置显示移动端预输入
ID: SC-MOBILE-PRE-INPUT-SETTING
Profile: draft
Gate: required
Given 用户未开启预输入框
When 用户在终端设置开启预输入框并返回移动端终端
Then 快捷键栏下方出现可编辑的预输入框，刷新后仍保持开启
And 关闭后预输入框隐藏，桌面布局不显示预输入框

# 场景 2：附件路径与草稿一起发送
ID: SC-PRE-INPUT-ATTACHMENTS-AND-TEXT
Profile: draft
Gate: required
Given 用户在移动端开启预输入框并打开可交互终端
When 用户从相册或文件选择多个附件、编辑文字并点击发送
Then 选择后附件先在输入框上方展示，点击发送后才按选择顺序逐个上传
And 全部上传成功后，全部路径在文字前一次发送到当前终端，不自动追加回车，草稿清空
And 仅选择附件也显示发送按钮并允许发送，空草稿隐藏发送按钮

# 场景 3：失败与终端切换不丢失或误发草稿
ID: SC-PRE-INPUT-RETRY-AND-TARGET
Profile: draft
Gate: required
Given 用户的草稿包含多个附件
When 上传失败或用户在上传期间切换终端
Then 不向其他终端发送草稿，草稿保留并显示可识别的反馈
And 返回原终端重试时保留已上传附件的路径，无需重复上传成功的附件
