# 终端输入真实环境回归

规格：[REQ](../../../spec/terminal/input/REQ.md) · [AC](../../../spec/terminal/input/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/input`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / multi-device
- 真实依赖：真实 Provider、persistent agent、PTY、Unified WebSocket、Chrome、Ghostty Canvas
- 相关模块和源码入口：`runtime/static/terminal/input/`、`runtime/static/terminal/output/`、`runtime/static/terminal/transport/`

## 触发条件

活动终端产生稳定 presentation 后，desktop 依次执行普通命令、Enter、Ctrl-C、20 KiB 输入和 DSR generated response。

## 用户可见问题

输入队列迁移或 resize/replay ready gate 出错时，普通字符、控制键、大文本或 generated response 可能丢失、重复或长期排队。

## 预防的回归

- 普通输入、Ctrl-C 和 20 KiB 文本按顺序进入真实 PTY。
- generated response 带正确分类且不携带普通输入尺寸字段。
- Canvas 随输出改变，每页只有一条 active Unified socket。

## 修复前基线

历史输入锁删除回归前已有行为基线；本轮全量审计确认 `data-connection` 可能被 resume deadline 留成非权威字符串，因此不再用它作为场景前置。

## 已确认根因

输入可用性的权威结果是稳定 presentation 后真实 input frame 与 PTY 回显；展示层 connection 字符串不是 transport/input ready 的唯一状态源。

## 实施方案

前置改为 terminal host 可见且 `renderReady/hasPresentedFrame` 成立；原有真实输入、Canvas、bundle、socket 和 fatal error 断言不变。

## 验证预期

全部输入 marker 有界回显，Canvas 非空且改变，generated payload、Vite 边界和 Unified socket 数正确。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/terminal/input/test.mjs
```
认证信息只通过 `spec-tests/.env` 或运行环境注入。

## 产物与失败诊断

`artifacts/<run-id>/` 保存截图、trace、JSONL、presentation probe、terminal timeline 和错误摘要；失败时结合 input payload、PTY output、resize response 和 socket 数判断。

## 已知限制

移动 context 仅参与共享连接门禁；本场景的输入动作以 desktop 为主，移动 IME 由场景 03/04 覆盖。

## 验证结果

- 2026-09-04 输入锁删除后真实场景通过，产物 `artifacts/2026-09-04T07-10-04-402Z/`；普通文本、Ctrl-C、20 KiB 输入、generated response、Canvas 和单 Unified socket 均符合断言。
- 最终 16 场景回归产物 `artifacts/2026-09-04T11-12-03-916Z/` 再次通过上述全部输入门禁。
