# 场景 1：粘贴与上传附件正确作用于当前终端
ID: SC-ATTACHMENT-NATIVE-PASTE
Profile: standard
Gate: required
Given 用户打开支持附件且可交互的终端
When 用户粘贴文本、提交附件或在桌面端手动上传后粘贴附件路径
Then 文本或附件路径仅提交到原目标一次，上传路径不会自动执行命令

# 场景 2：直接粘贴剪贴板图片
ID: SC-CLIPBOARD-IMAGE-PASTE
Profile: draft
Gate: required
Given 用户打开支持附件且可交互的终端，系统剪贴板中有图片
When 用户使用终端右键菜单的“粘贴”、系统粘贴快捷键、Shift+Insert 或自定义粘贴快捷键
Then 图片自动上传，成功后远端路径仅写入触发操作时的终端一次，无需再次粘贴且不自动回车
And 同一图片的多种格式只上传一种，同时携带的文本不另行写入，系统剪贴板内容保持不变
When 用户改为粘贴纯文本
Then 文本直接进入原终端，不被上传为附件

# 场景 3：图片粘贴的迟到结果与失败反馈
ID: SC-CLIPBOARD-IMAGE-PASTE-GUARDS
Profile: draft
Gate: required
Given 用户从终端发起剪贴板图片粘贴
When 读取剪贴板或上传期间关闭原 pane、切换实例或销毁页面
Then 迟到结果不会向其他终端写入路径，也不会把图片上传到后来切换的实例
When 浏览器禁止主动读取剪贴板，或图片上传失败
Then 显示可操作的失败原因，读取权限受限时提示使用系统粘贴快捷键，不插入无效路径
