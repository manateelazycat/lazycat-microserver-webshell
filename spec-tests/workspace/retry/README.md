# Workspace refresh/retry 真机回归

规格：[REQ](../../../spec/workspace/retry/REQ.md) · [AC](../../../spec/workspace/retry/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector workspace/retry`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / lifecycle
- 真实依赖：真实 Provider、agent、PTY、Unified WebSocket、workspace API、Chrome route interception
- 相关模块和源码入口：`runtime/static/workspace/refresh_controller.js`、`refresh_lifecycle.js`、`spec-tests/run-playwright.mjs`

## 触发条件

desktop reload 时只把第一次 workspace GET 注入为 HTTP 503，随后允许真实请求成功。

## 用户可见问题

瞬时 workspace 失败可能导致页面永久空白、丢失隔离 tab，或重试过程中重复建立物理 socket。

## 预防的回归

- 恰好一次 503 后自动退避并成功恢复同一 tab。
- 稳定 presentation/Canvas、Vite bundle 边界和唯一 Unified socket 成立。
- 注入的预期 API error 被明确隔离，其他 fatal error 仍失败。

## 修复前基线

`artifacts/2026-09-04T08-27-27-707Z/` 曾被 Chrome Local Network Access 策略阻断，未进入产品断言；运行器随后只向目标 origin 授权。旧测试还依赖非权威 `data-connection=open` 前置。

## 已确认根因

workspace 恢复成功应由真实 200 response、recovery success 日志、稳定 Canvas 和 socket 证明；展示 connection 字符串可能被 resume deadline 留成 reconnecting。

## 实施方案

保留单次 503 注入和恢复断言，终端前置改为稳定 presentation + 非空 Canvas。全局 console error 纳入 fatal 后，本场景只在确认 `failedWorkspaceGets===1` 时过滤 Chrome 为这次已知注入自动生成的精确 503 resource console 文案；其他 console error 不得过滤。

## 验证预期

503 注入次数为 1，观察到 retry success，最终 Canvas 非空且仅一条 active Unified socket。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/workspace/retry/test.mjs
```

## 产物与失败诊断

产物位于 `artifacts/<run-id>/`；结合 API response、recovery console、Canvas、socket 和 trace 判断。

## 已知限制

503 由浏览器 route 精确注入；Provider 本身不被人为停机。

## 验证结果

最终 16 场景回归产物 `artifacts/2026-09-04T11-13-50-979Z/` 通过：只记录一次预期 `HTTP 503 GET /api/workspace`，随后观察到真实 200 恢复、success 日志、稳定 Canvas 和唯一 active Unified socket；没有其他 fatal error。
