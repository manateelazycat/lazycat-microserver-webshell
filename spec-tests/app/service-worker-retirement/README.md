# Service Worker 退役真实环境回归

规格：[REQ](../../../spec/app/service-worker-retirement/REQ.md) · [AC](../../../spec/app/service-worker-retirement/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector app/service-worker-retirement`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：lifecycle / PC / mobile
- 真实依赖：真实 Chrome、浏览器 Service Worker/Cache API、临时同源 HTTP fixture、真实 Provider/agent/PTY
- 相关模块和源码入口：`runtime/static/app/bootstrap/legacy_service_worker_retirement.js`、`runtime/static/index.html`、`spec-tests/run-playwright.mjs`、`spec-tests/test-all.sh`

## 触发条件

fixture 在 `/service-worker.js` 先提供模拟历史 Worker，让页面进入受控状态并写入旧 app-shell/terminal Cache；随后切换为当前工作区的退役脚本，并通过普通页面导航执行生产 `index.html` 中的前置更新逻辑。测试不得直接调用 `registration.update()`。完成后返回真实 WebShell，确认终端重新连接并显示。

## 用户可见问题

完整回归过去把 `WEBSHELL_LOCAL_STATIC_DIR` 传给所有场景，运行器因此阻止 Service Worker。本场景检测到该配置后只记录 `service-worker-retirement-skipped` 并正常返回，`test-all.sh` 仍打印 PASS，发布门禁可能在完全没有执行 Worker 退役路径时显示全绿。

## 预防的回归

- required 场景不得静默 skip 后显示 PASS。
- 总入口运行本场景时必须清空本地静态映射并允许 Service Worker。
- 历史 Worker 必须由当前退役 Worker 自动接管，精确清理旧 Cache 并注销 registration。
- 用户导航之外，原受控页面只允许再导航一次；干净移动 context 不得注册或请求 Worker。
- 返回真实 WebShell 后终端 Canvas 必须恢复。

## 修复前基线

2026-09-04 审计发现 `test-all.sh` 对全部目录使用同一环境；设置当前构建映射时，本用例在 `config.localStaticDir` 分支记录 `service-worker-retirement-skipped` 后返回 0，总入口随后打印 PASS。该行为是测试编排缺陷，不代表产品 Service Worker 退役失败。

## 已确认根因

总入口没有场景 profile，也没有识别 required 场景的 skip 输出；本用例又把不满足真实运行前提当成可成功返回的分支，三者共同造成假绿。

## 实施方案

- `test-all.sh` 为本场景单独清空 `WEBSHELL_LOCAL_STATIC_DIR`，其他场景使用本次构建。
- 本用例在错误设置本地静态映射时直接失败并给出配置原因，不再返回 skip。
- 总入口检查运行输出，任何 `[skip]` 或 `-skipped` 都使 required 场景失败。
- `tests/tests_auto_runner_test.mjs` 用 dry-run 固定 16 个场景 profile，并确保 dry-run 不伪称测试通过。

## 验证预期

- 本场景与其他模块使用同一批次的最新本地构建；WebShell 页面保留严格静态替换，浏览器上下文单独允许 Service Worker。
- 完整回归实际执行 Worker install/activate/cache cleanup/unregister 和返回真实终端，不出现 skip。
- 所有步骤完成后只有总入口输出全场景通过。

## 运行命令和环境变量

```sh
HEADLESS=1 \
WEBSHELL_LOCAL_STATIC_DIR= \
node spec-tests/run-playwright.mjs spec-tests/app/service-worker-retirement/test.mjs
```

也可由 `HEADLESS=1 ./spec-tests/test-all.sh` 自动应用本场景 profile。认证信息只通过 `spec-tests/.env` 或运行环境注入。

## 产物与失败诊断

产物位于 `artifacts/<run-id>/`，包括页面截图、trace、JSONL、错误摘要和终端时间线。失败时同时检查 Worker registration、cache names、导航次数、fixture 请求记录和返回真实 WebShell 后的 Canvas/连接状态。

## 已知限制

- fixture 验证真实浏览器 Worker 生命周期，但 Provider 的实际路由、响应头和 LPK 打包内容由 Go/构建测试独立固定。
- 发布前在设备允许安装 LPK 时，仍应补做一次不经过路由替换的真实包升级验证。

## 验证结果

最终全量中的 `artifacts/2026-09-04T11-15-21-422Z/` 真实执行并通过 Worker install/activate、旧 Cache 清理、registration 注销、受控/干净 context 导航次数和返回真实终端；没有 skip。Chrome 对 `/favicon.ico` 的自动 404 只按精确 source URL 记录为场景外 info。
