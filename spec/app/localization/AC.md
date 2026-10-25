# 场景 1：英文设置分类和终端设置文案完整
ID: SC-ENGLISH-SETTINGS-LABELS
Profile: draft
Gate: required
Given 用户在英文浏览器环境下打开 WebShell
When 用户打开设置并查看各分类、光标样式和平滑光标、字号及其校验反馈
Then 对应标题、说明、选项、按钮提示和反馈显示英文
And 桌面侧栏及移动分类列表使用 Terminal、Theme、Mobile Shortcuts、PC Shortcuts 和 Service Forwarding，不附加 Settings
And 字号区域只显示一次 Font Size 标题，下方只说明范围、默认值和立即生效；输入框仍有可识别的无障碍名称与说明
When 用户在中文浏览器环境下打开设置
Then 相同入口继续显示中文，设置值和操作保持原有行为

# 场景 2：动态界面提示使用对应语言并保留数据
ID: SC-LOCALIZED-DYNAMIC-FEEDBACK
Profile: draft
Gate: required
Given 用户在英文浏览器环境下使用 WebShell
When 用户使用附件上传、剪贴板、搜索与复制、长截图、服务转发、会话关闭确认或诊断界面，并触发相关状态更新或失败反馈
Then 固定界面文案和反馈显示英文，数量、路径和用户命名保持原值
And 更新后的按钮提示、占位文字和无障碍标签也显示英文，终端内容与命令保持原值
