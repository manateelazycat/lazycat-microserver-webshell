# 场景 1：工作区标签创建与命名保持可用
ID: SC-WORKSPACE-TABS
Profile: standard
Gate: required
Given 用户已打开包含终端的工作区
When 用户创建标签、修改标签名称并刷新页面
Then 新标签能打开终端，修改后的名称在刷新后仍保留
