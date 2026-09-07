# 场景 1：冷缓存打开当前版本后终端正常呈现
ID: SC-VITE-COLD-START
Profile: standard
Gate: required
Given 浏览器尚未缓存当前版本的页面资源
When 用户首次打开当前版本 WebShell
Then 所需页面资源成功加载并显示可交互的终端
