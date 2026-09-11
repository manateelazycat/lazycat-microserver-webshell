# 终端 IME 真实环境回归

规格：[REQ](../../../spec/terminal/ime/REQ.md) · [AC](../../../spec/terminal/ime/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/ime`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / mobile / lifecycle
- 真实依赖：真实 Provider、persistent agent、PTY、Unified WebSocket、Chrome IME/textarea、Ghostty Canvas
- 相关模块和源码入口：`runtime/static/terminal/input/ime/`、`runtime/static/terminal/input/`、`runtime/static/app/paste/`

## 触发条件

稳定终端上执行 composition/preedit、重复 input、ASCII separator、连续 Backspace、paste/beforeinput，以及移动端单击 blur、同步双击 focus。

## 用户可见问题

IME 事件可能重复提交、吞空格/删除/粘贴，或移动端无法通过双击同步打开键盘。

## 预防的回归

- composition 和 paste 各只提交一次，连续 Backspace 保留浏览器原生语义。
- 移动端单击不误开键盘，双击在 preventDefault 前同步 focus。
- Canvas、bundle 边界、单 Unified socket 和 fatal error 门禁保持正常。

## 修复前基线

2026-09-06 补丁发布回归的 `artifacts/2026-09-06T15-17-46-657Z/` 在 IME 动作前被登录门户 `/sys/static/languages/zh/translation.json` 的 `net::ERR_FAILED` console error 拦截。JSONL 明确记录来源为认证门户，截图显示登录后终端已正常展示，trace/terminal timeline 可用于确认其后 WebShell 已完成连接与呈现。这是场景外认证门户资源的环境故障，不是终端资源或 IME 断言失败；保留原错误门禁，单独重跑本场景确认恢复，再继续未运行场景。

- 历史输入锁删除后场景已通过。
- 本轮完整回归 `artifacts/2026-09-04T10-44-20-774Z/` 在 IME 动作前等待 desktop `data-connection=open` 超时；desktop 已稳定 presentation/Canvas，mobile 同 pane 为 open，证明是非权威展示属性误报。

## 已确认根因

resume deadline 可留下 `data-connection=reconnecting`，即使 `data-connection-retrying=false`、presentation 已提交且 logical stream 可用；IME 应以真实输入/回显验证，不以该字符串作前置。

## 实施方案

双端前置改为 host 可见、稳定 presentation 和非空 Canvas；所有 IME 事件顺序、payload、PTY、socket 与资源断言原样保留。

## 验证预期

composition/paste marker 回显且只发送一次，delete/ASCII/touch focus 契约成立，两页各一条 active Unified socket。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/terminal/ime/test.mjs
```
认证信息只通过 `spec-tests/.env` 或运行环境注入。

## 产物与失败诊断

产物位于 `artifacts/<run-id>/`；结合 input frames、PTY output、触摸事件顺序、截图、trace 和 terminal timeline 分析。

## 已知限制

Playwright mobile context 不等同于原生 Android/iOS 输入法，但能够固定浏览器 DOM/IME 事件契约。

## 验证结果

2026-09-06 登录门户资源恢复后，原断言独立重跑在 `artifacts/2026-09-06T15-19-23-057Z/` 通过 composition、Backspace、paste、触摸 focus、Canvas 与 socket 门槛；没有忽略或放宽 console error 检查。

- 2026-09-04 历史运行 `artifacts/2026-09-04T07-14-05-758Z/` 通过 composition、Backspace、paste 去重、单击 blur、双击 focus、Canvas 和单 socket 断言。
- 前置修正后独立通过，并在最终全量的 `artifacts/2026-09-04T11-12-24-059Z/` 再次通过所有 IME/触摸门禁。
