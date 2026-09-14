# 场景 1：满历史多会话恢复和调整布局后仍可交互
ID: SC-SESSION-LOAD-RESPONSIVENESS
Profile: draft
Gate: required
Given 工作区至少有十个独立终端，每个保留达到配置上限的历史，且有终端持续输出
When 用户重新打开工作区、切换标签并连续调整窗口尺寸和分屏比例
Then 可见终端及时响应，最终尺寸符合操作结果，各终端可继续输入而无需重新进入
And 保留窗口内的历史和新输出不丢失或错序，所有终端共用页面唯一业务连接

# 场景 2：会话处理失败后无需再次操作即可恢复
ID: SC-SESSION-LOAD-AUTOMATIC-RECOVERY
Profile: draft
Gate: required
Given 用户打开多个终端，其中一个本地终端处理失败且服务端会话仍可接入
When 页面自动恢复该会话且用户不再操作页面
Then 恢复继续推进至可显示并可输入，不因旧尺寸处理失败而一直等待
And 其他会话保持可用，恢复不重启服务端 PTY，也不重复执行输入
