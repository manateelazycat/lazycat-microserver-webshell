# 场景 1：粘贴与上传附件正确作用于当前终端
ID: SC-ATTACHMENT-NATIVE-PASTE
Profile: standard
Gate: required
Given 用户打开支持附件且可交互的终端
When 用户粘贴文本、提交附件或在桌面端手动上传后粘贴附件路径
Then 文本或附件路径仅提交到原目标一次，上传路径不会自动执行命令
