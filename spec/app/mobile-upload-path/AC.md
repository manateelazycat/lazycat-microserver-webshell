# 场景 1：移动端选择文件上传成功后路径进入终端
ID: SC-ATTACHMENT-MOBILE-UPLOAD-PATH
Profile: draft
Gate: required
Given 用户在移动端打开支持附件且可交互的终端
When 用户打开文件管理，选择「上传文件」，在系统文件选择器中选中本地文件并上传成功
Then 远端路径只进入开始上传时的那条终端一次，且不会自动执行
And 上传进度只提示上传成功，不再提示需要从剪贴板粘贴路径
