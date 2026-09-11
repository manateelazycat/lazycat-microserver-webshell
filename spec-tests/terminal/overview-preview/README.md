# 终端总览预览持久化真实环境回归

规格：[REQ](../../../spec/terminal/overview-preview/REQ.md) · [AC](../../../spec/terminal/overview-preview/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/overview-preview`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / lifecycle
- 真实依赖：真实 Provider、persistent agent、PTY、Unified WebSocket、Chrome IndexedDB、Canvas/ImageBitmap
- 相关模块和源码入口：`runtime/static/terminal/overview/`、`runtime/static/global-runtime.js`、`spec-tests/run-playwright.mjs`

## 触发条件

在真实隔离 workspace 中创建第二个 tab，等待该 tab 的已提交终端画面真正写入独立 IndexedDB 缩略图存储，然后切回原 tab 并刷新应用。刷新后在后台 tab 尚未产生稳定 live Canvas 时打开终端总览，必须从持久缩略图解码并绘制该 tab。

## 用户可见问题

如果预览尚未完成持久化就刷新，后台 tab 卡片会显示“无预览”。旧测试使用 async `page.waitForFunction` 等待 IndexedDB transaction，在当前 Playwright/浏览器组合中可能把仍 pending 的 Promise 当成已满足条件，造成前置假通过和 reload 后假失败，也可能让以往整条场景假绿。

## 预防的回归

- reload 前必须从独立 IndexedDB transaction 读到目标 tab/pane 的有效 image Blob、尺寸和 identity。
- reload 后目标后台 tab 必须使用非 `HTMLCanvasElement` 的持久图片来源绘制，不能显示“无预览”。
- live Canvas、有效 hold 和持久 Blob 的来源优先级保持不变。
- 测试只检查派生缩略图 Blob，不得恢复 PTY 字节、触发历史 replay、改变输入 ready 或为后台 tab 新建额外物理 Unified WebSocket。

## 修复前基线

- 完整回归 `artifacts/2026-09-04T10-18-28-954Z/` 在 reload 后的持久图片 draw 等待超时；截图中目标后台 tab 显示“无预览”。
- 增强诊断后的 `artifacts/2026-09-04T10-21-04-116Z/`、`10-22-38-202Z/`、`10-23-31-983Z/` 证明旧等待在目标 tab 尚未发生 IndexedDB put 时就返回，随后诊断自然读不到该目标记录；其他 tab 的 ImageBitmap 解码和绘制正常。

## 已确认根因

产品使用异步 Canvas encode 和 IndexedDB transaction 持久化缩略图；旧测试把该过程放进 async `page.waitForFunction`。该等待没有可靠地把 transaction 最终布尔结果作为轮询条件，导致用例在目标记录尚不存在时继续 reload。产品的 capture/store/decode 契约没有失败。

## 实施方案

- 把单次 IndexedDB 查询封装为页面内完成的真实 transaction，并把记录结果返回 Node。
- 由 Node 使用 50ms 可观察轮询和 20 秒有界超时等待目标记录，成功时保存 key、selector、workspace/tab/pane identity、history generation、尺寸和 Blob 大小。
- reload 后 draw 超时会附带 reload 前记录、当前 tab/pane/history、实际 draw sources 和当前 DB records，便于区分保存、identity、decode 与绘制失败。

## 验证预期

- 目标记录未落盘时测试不得进入 reload。
- reload 后 overview observer 必须观察到目标 tab 从 ImageBitmap 等非 live Canvas 来源绘制。
- 当前 Vite bundle 边界、真实 workspace cleanup 和 fatal error 门禁保持通过。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 \
WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/terminal/overview-preview/test.mjs
```

认证信息只通过 `spec-tests/.env` 或运行环境注入。

## 产物与失败诊断

产物位于 `artifacts/<run-id>/`，包括截图、trace、JSONL、presentation probe、terminal timeline 和错误摘要。持久 draw 失败信息还包含 reload 前记录及 reload 后 identity/draw/DB 快照。

## 已知限制

- 浏览器场景验证 Chrome IndexedDB 与 ImageBitmap；其他浏览器的 decode 差异仍需各自设备覆盖。
- 目标 tab 在测试结束时通过真实 workspace API 清理；预览 store 的 TTL/容量边界由 Node 测试覆盖。

## 验证结果

2026-09-04 修正等待后，`artifacts/2026-09-04T10-25-34-296Z/` 完整通过：目标记录真实落盘后才 reload，后台 tab 的持久 ImageBitmap 被绘制，隔离 tab 清理和 fatal error 门禁通过；产品代码无需修改。

最终 16 场景回归产物 `artifacts/2026-09-04T11-15-41-309Z/` 再次通过真实 IndexedDB transaction、reload 后 ImageBitmap 绘制和 cleanup。
