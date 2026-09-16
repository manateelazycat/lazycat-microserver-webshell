# 场景 1：冷缓存请求获得压缩且完整的页面资源
ID: SC-GZIP-COLD-RESOURCES
Profile: draft
Gate: required
Given 浏览器未缓存当前版本 WebShell 页面资源
When 浏览器声明优先接受 gzip 并请求入口 HTML、主脚本、终端 Worker、CSS 和 WASM
Then 各响应使用 gzip 编码，正文小于原文，解压后的内容与原文一致
And 响应通过 Vary 声明 Accept-Encoding 差异，WASM 保留正确的内容类型
When 浏览器不声明接受 gzip 或明确拒绝 gzip 并接受原文
Then 相同资源返回可正常使用的未压缩正文

# 场景 2：压缩交付保留版本缓存与校验
ID: SC-PRESERVE-RESOURCE-CACHING
Profile: draft
Gate: required
Given 浏览器取得当前版本的 gzip 静态资源
When 浏览器正常重新打开同版本页面且缓存仍新鲜
Then 版本化静态资源允许长期复用，入口 HTML 仍禁止存储
When 浏览器携带该资源的 Last-Modified 时间发起校验
Then 未变化的资源返回 304 且没有正文
When 浏览器请求不存在的资源或已失效的资源版本
Then 返回错误响应且不允许作为长期成功资源缓存
