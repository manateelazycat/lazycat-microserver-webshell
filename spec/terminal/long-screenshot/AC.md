# 场景 1：Android 长截图各分片完整保存
ID: SC-ANDROID-LONG-SCREENSHOT-DOWNLOAD
Profile: draft
Gate: required
Given 用户在 Android 浏览器打开真实终端并滚动查看多屏历史
When 用户从终端菜单生成长截图并确认保存
Then 单张截图或生成的每个 PNG 分片都可以在浏览器下载结果中找到并打开
And 多分片内容上下连续，不遗漏中间分片，不为截图改变终端内容
And 页面反馈下载已发起，不把发起请求误报为浏览器已经保存成功
