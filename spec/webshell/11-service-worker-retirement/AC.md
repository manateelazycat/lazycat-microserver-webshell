# 场景 1：旧离线页面缓存退役后可以打开当前终端
ID: SC-SERVICE-WORKER-RETIREMENT
Profile: standard
Gate: required
Given 浏览器曾使用旧版离线页面缓存
When 用户通过正常导航打开当前版本页面
Then 旧缓存与离线控制被清理，当前页面能重新打开真实终端
