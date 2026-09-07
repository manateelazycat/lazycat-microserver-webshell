# 场景 1：浏览器文本组合与编辑正确提交
ID: SC-TERMINAL-IME
Profile: standard
Gate: required
Given 终端输入区域已获得焦点
When 用户组合输入文本、插入空格、连续退格并粘贴文本
Then 已确认文本按编辑后的内容提交，不重复且不丢失
