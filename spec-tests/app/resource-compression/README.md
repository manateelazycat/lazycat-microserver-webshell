# Android 页面资源交付验收

目标规格：[REQ](../../../spec/app/resource-compression/REQ.md) · [AC](../../../spec/app/resource-compression/AC.md)。环境要求见 [ENVIRONMENT](../../ENVIRONMENT.md)。

`android.mjs` 在 Pixel 9 Pro 模拟器中已安装的 LightOS WebView 里请求当前 LPK 的入口 HTML、主脚本、后端 Worker、CSS 和 WASM，分别验证 gzip 与明确 `identity` 的响应、正文大小、解压内容哈希、`Vary` 和 WASM 类型。

`android-cache.mjs` 重新打开同一版本的专用终端页面，检查脚本从浏览器缓存复用、HTML `no-store`、`Last-Modified` 的 304 无正文，以及不存在和旧版本资源的错误响应。测试结束清理专用标签。

两个 AC 仍为 `draft`，批量执行时显式选择：

```sh
./run-ac.sh --selector app/resource-compression --profile draft --target android-emulator
```
