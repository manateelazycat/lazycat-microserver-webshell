# 场景 1：各调试窗口可下载与复制同口径的日志
ID: SC-DIAGNOSTIC-LOG-DOWNLOAD
Profile: draft
Gate: required
Given 用户正在查看有复制功能的调试日志窗口
When 用户点击复制按钮左侧的下载按钮
Then 浏览器下载名称包含日志类型与时间、以 -log.md 结尾的文件
And 文件包含对应复制功能导出的全部保留数据及说明，不仅包含当前窗口摘要
And 终端渲染异常捕获导出包含本次操作补抓的当前状态
And 没有可导出数据或下载发起失败时，用户得到提示
