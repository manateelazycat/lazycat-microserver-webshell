---
id: REQ-APP-RESOURCE-COMPRESSION-001
status: draft
---

# WebShell 页面资源压缩传输

## 背景

用户通过中继首次打开 WebShell 或首次打开新版本时，需要下载主脚本、终端 Worker、WASM 和样式。现有资源已有长期缓存，但源站即使收到接受 gzip 的请求仍发送原文，主脚本约为 1.56 MB。

## 需求目标

接受 gzip 的浏览器可以取得压缩的入口页面和静态资源，减少冷缓存访问的传输量；解压后的内容保持一致。不接受 gzip 的浏览器继续取得原文。

同版本静态资源保持长期缓存，过期后的 Last-Modified 校验继续可用；浏览器与代理可区分压缩和原文表示。入口页面继续禁止存储，以取得当前资源版本。

## 范围

独立 Provider 和 LightOS 内置 Provider 的入口 HTML、JS、Worker、CSS、WASM 及其他可压缩静态资源的构建与 HTTP 交付。

## 非目标

本次不拆分前端模块、不调整启动依赖、不更改 API、WebSocket、终端恢复协议或 WASM，不自动更新运行中的 Agent。不保证固定的手机加载耗时。
