# Workspace 标签真实环境回归

规格：[REQ](../../../spec/workspace/tabs/REQ.md) · [AC](../../../spec/workspace/tabs/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector workspace/tabs`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / multi-device / lifecycle
- 真实依赖：真实 workspace API、Provider、agent、PTY、Unified WebSocket、Chrome Canvas
- 相关模块和源码入口：`runtime/static/workspace/`、`runtime/static/terminal/session/`、`runtime/static/terminal/transport/`

## 触发条件

在隔离 tab 中新建第二个真实终端，关闭临时 tab，双击 inline rename，提交 `rename_tab` 并刷新验证服务端持久化。

## 用户可见问题

新 tab 可能在 subscription 尚未注册时发送 priority/control，造成空白终端；标签名也可能只在本地变化、刷新后丢失。

## 预防的回归

- 新终端达到稳定 presentation、Canvas 非空，不出现 inactive stream 错误。
- 新建 tab 不替换页面唯一 Unified 物理 socket。
- rename 经真实 API 持久化，reload 后仍存在；所有临时 tab 被清理。

## 修复前基线

历史用例以 `data-connection=open` 作为多个前置；本轮审计确认该展示字段可能在 logical stream 可用时保持 reconnecting，存在误报风险。

## 已确认根因

workspace 用户结果由稳定 presentation、Canvas、API 持久化和 socket membership 共同决定，展示层 connection 字符串不是权威 ready gate。

## 实施方案

所有初始/新建/返回/reload 前置改为稳定 presentation + 非空 Canvas；subscription、API、label、资源、socket 和 cleanup 断言保持不变。

## 验证预期

新终端可见且非空，rename reload 后保留，每页只有一条 active Unified socket，无 fatal/transport error。

## 运行命令和环境变量

```sh
npm run build
HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/workspace/tabs/test.mjs
```
认证信息仅由环境注入。

## 产物与失败诊断

产物位于 `artifacts/<run-id>/`；重点检查 workspace responses、membership/control 顺序、Canvas、socket 和 timeline。

## 已知限制

仅自动覆盖 desktop inline rename；移动端标签交互由其他 workspace/overview 场景覆盖。

## 验证结果

最终 16 场景回归产物 `artifacts/2026-09-04T11-13-30-556Z/` 通过新终端 presentation/Canvas、subscription 顺序、单物理 socket、rename 持久化和临时 tab 清理。
