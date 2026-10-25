# 场景 1：刷新页面后总览仍显示已保存的终端预览
ID: SC-OVERVIEW-PREVIEW-PERSISTENCE
Profile: standard
Gate: required
Given 工作区多个标签已有可见内容和已保存预览
When 用户刷新页面并在后台标签尚未完成实时呈现时打开总览
Then 总览仍能显示对应标签上次保存的预览

# 场景 2：移动端总览滑动与长按排序互不干扰
ID: SC-MOBILE-OVERVIEW-SCROLL
Profile: draft
Gate: required
Given 用户在移动端打开预览列表超过一屏的终端总览，终端仍在后台输出并更新预览
When 用户从预览卡片区域连续上下滑动、轻扫后松手，随后反向滑动
Then 列表连续滚动并保留惯性，能够到达两端，不因预览更新而中断、回跳或进入拖拽
And 普通滑动不切换、关闭或重排标签
When 用户按住卡片不移动后拖动并释放
Then 卡片可以排序，释放后恢复普通上下滚动
When 用户关闭并重新打开总览
Then 没有遗留拖动或触摸拦截，列表仍可正常滑动
