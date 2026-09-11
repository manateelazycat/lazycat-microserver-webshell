# 场景 1：刷新页面后总览仍显示已保存的终端预览
ID: SC-OVERVIEW-PREVIEW-PERSISTENCE
Profile: standard
Gate: required
Given 工作区多个标签已有可见内容和已保存预览
When 用户刷新页面并在后台标签尚未完成实时呈现时打开总览
Then 总览仍能显示对应标签上次保存的预览
