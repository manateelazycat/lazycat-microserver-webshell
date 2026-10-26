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
Given 用户在移动端打开按多个实例分组且超过一屏的终端总览，其中一个实例有多个可排序的会话，终端仍在后台输出并更新预览
When 用户从预览卡片区域连续上下滑动、轻扫后松手，随后反向滑动
Then 列表连续滚动并保留惯性，能够到达两端，不因预览更新而中断、回跳或进入拖拽
And 普通滑动不切换、关闭或重排标签
When 用户按住卡片不移动后拖动并释放
Then 卡片仅在所属实例内排序，不迁移到其他实例，释放后恢复普通上下滚动
When 用户关闭并重新打开总览
Then 没有遗留拖动或触摸拦截，列表仍可正常滑动

# 场景 3：移动端预览展示全部实例并进入所选会话
ID: SC-MOBILE-GROUPED-OVERVIEW
Profile: draft
Gate: required
Given 用户可访问多个已有终端会话的实例，实例中有同名会话，部分会话已有预览画面，另一个实例的会话包含分屏
When 用户在移动端打开终端预览
Then 预览按实例名分组展示全部实例的全部已打开会话，不限于当前实例，没有画面的会话显示「无预览」
When 用户选择另一个实例中包含分屏的会话
Then 进入所选实例的所选会话并保留原有分屏，不误入其他实例的同名会话

# 场景 4：传统 PC 预览使用全部实例的共享顺序
ID: SC-LEGACY-PC-GROUPED-OVERVIEW
Profile: draft
Gate: required
Given 用户在传统 PC 布局中访问多个微服、物理机和其他应用实例，账号已保存实例顺序，各实例已有终端会话
When 用户打开终端预览
Then 按服务端保存的实例顺序分组展示全部会话，不限于当前实例，实例内标签顺序保持原样
And 缺少画面的会话显示「无预览」，选择另一实例的会话可以进入对应实例和会话
And 传统 PC 导航保持可用，新版 PC 不因此恢复已隐藏的预览入口
