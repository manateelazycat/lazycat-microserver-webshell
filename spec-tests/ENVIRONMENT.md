# 测试机、认证和浏览器环境

本文件是所有测试模块共享的环境说明。开始测试时，Agent 先读这里，再读选中模块的 REQ/AC 和该模块 README；不需要读取全部测试脚本。

## 目标测试机

- 地址示例：`https://lightos.debug123.heiyu.space/webshell/?name=debug123%40cloud.lazycat.lightos.entry&tab=tab-4`。
- 实际地址通过 `tests-auto/.env` 中的 `WEBSHELL_TEST_URL` 或运行环境传入；示例不作为隐藏默认值。
- 测试账号、密码和认证信息只通过未提交的 `tests-auto/.env` 或运行环境注入。也可用 `--env-file` 显式指定同格式的本地文件。
- `environment/config.mjs` 负责配置加载，进程环境优先于文件；配置值按文本读取，不执行 shell 代码。
- `environment/target.mjs` 负责登录和实例选择；`environment/browser.mjs` 负责浏览器窗口及测试资源生命周期。

```dotenv
WEBSHELL_TEST_URL=https://<authorized-test-host>/webshell/?name=<instance>
WEBSHELL_TEST_USERNAME=<test-account>
WEBSHELL_TEST_PASSWORD=<test-password>
TEST_FOREGROUND=1
PW_CHANNEL=chrome
DISPLAY=:0
```

不要提交填好的 `.env`。运行器默认不会读取其他应用的账号，也不会自动猜测测试机。

## 登录和实例选择

1. 每个浏览器上下文先打开测试站点。页面进入登录页时自动填写账号和密码并提交；已有有效登录态时不会重复登录。缺少登录所需凭据时明确失败。
2. 可通过 `WEBSHELL_TEST_STORAGE_STATE` 指向本地未提交的 Playwright 登录态文件；其中的认证信息按凭据管理。
3. 运行器读取 `/webshell/api/instances`，检查指定实例是否对当前账号可见且处于 `running` 状态。
4. 必须使用配置中明确的 selector；指定实例不可用时直接失败，不自动选择其他 running 实例。
5. 客户端历史恢复模块 17 必须通过 `WEBSHELL_CLIENT_TEST_URL`（或明确的主测试 URL）绑定真实、在线、获授权的 `client:` 目标；不自动选取其他客户端或普通容器。
6. 测试创建专用标签并清理自己的标签/进程/附件，保留测试账号已有资源；示例 URL 的 tab 不作为可清理资源。

## 浏览器和网络权限

默认使用本机安装的 Google Chrome，`channel=chrome`，以有界面模式打开桌面和移动布局两个独立窗口。运行环境必须提供有效的 X11 `DISPLAY`，并允许当前用户连接该显示会话。

桌面窗口为 1440×900，移动布局为 390×844。模块 17 按自身声明只使用桌面窗口；模块 13 为隔离分屏故障会主动关闭移动窗口。这些是模块自己的测试边界。

运行器在打开页面前，只向目标测试 origin 授予 Chrome 的 `local-network-access` 权限，允许站点访问真实 Provider WebSocket；不会全局关闭浏览器安全特性。权限配置失败时应明确报错。

确需无界面环境时显式设置 `TEST_FOREGROUND=0`（或 `HEADLESS=1`）；需要 Chromium 时显式设置 `PW_CHANNEL=chromium`。这些配置不能写成已经完成默认有界面 Chrome 验证。

移动窗口是桌面 Chrome 的布局/触控模拟。真实 Android Chrome、系统键盘、候选词和系统剪贴板通过 agent-device 在明确绑定的模拟器或物理设备上验证，流程见 [device-workflow.md](device-workflow.md)。原生 IME 场景关闭测试 IME。

## 构建与特殊模块

所有正式自动测试必须使用最新本地前端。`run-ac.sh`、直接批次入口和直接场景运行器会在执行前通过共享构建模块运行 `npm run build`；一批测试只构建一次。MCP 打开浏览器时同样准备当前构建。

产物复制到独立快照，记录工作树源码摘要、产物摘要和逐文件哈希。每项运行前后检查源码与快照；运行中修改源码、删除或改写产物会失败。环境自动注入本批次的静态目录，旧 `.env` 中的静态目录不再决定测试版本，也不提供任意 `--static-dir` 覆盖。

浏览器打开 WebShell 页面前安装严格资源拦截，页面标记和响应头必须匹配本批次构建。HTML、JavaScript、CSS、WASM 使用本地快照；本地缺文件或摘要不符直接中止请求并使测试失败，不回退远端。站点登录、API、Provider、WebSocket、PTY 以及账号配置的字体数据仍来自真实服务。

第 11 项现在也替换为相同的本地前端，只允许其真实 Service Worker 生命周期操作；旧 Worker 历史环境使用该快照中的当前退役脚本和导航更新代码，返回 WebShell 时仍校验本地构建。04 的 UA 和 17 的真实客户端目标要求保持原有定义。

agent-device 自动化目前没有接入可验证的本地前端通道，因此项目的执行接口会明确报错，不再打开已部署旧页面冒充本地测试。设备发现、doctor 和安装配置仍可使用；浏览器测试使用已实现的共享 Playwright 环境。

## 开始测试与读取结果

在产品根目录执行：

```sh
node spec-tests/environment/inspect.mjs
./run-ac.sh --dry-run
./run-ac.sh
./run-ac.sh --selector webshell/02-terminal-input
./run-ac.sh --env-file /absolute/path/to/test.env --json
```

无参数 `run-ac.sh` 默认选择全部已接入模块；`--help` 只展示帮助。执行链路为 `run-ac.sh → Project AC Executor → tests-auto/test-all.sh → 各模块 test.mjs`。单模块选择仍经过同一个批次入口，只执行选中的模块。

也可以直接执行 `spec-tests/tests-auto/test-all.sh`。`TESTS_AUTO_DRY_RUN=1` 或 `--dry-run` 仅列出模块，不启动浏览器、不验证登录，也不表示测试通过。

统一入口输出每个 AC 的状态、耗时及报告路径；批次继续收集其余模块的结果，失败或跳过都不能汇总为通过。项目报告在 `spec-tests/reports/`，直接运行批次的报告在 `spec-tests/artifacts/suites/`。模块原有断言及事件日志作为场景级证据，不伪造逐步骤验证或强制所有测试使用 OCR。

执行结束后，最后单独输出 `测试总用时：9 分 18.605 秒（558.605s）`。这是从入口启动到子流程退出的实际经过时间，包含构建、环境准备、执行与清理，不是各用例耗时相加。前台 Chrome、无头运行和重定向到后台日志均输出；正常通过、测试失败和参数错误保留原退出码并输出总用时。帮助和 dry run 不作为测试计时。

`--json` 时 stdout 仍只有一个 JSON 对象，`duration_seconds` 和 `summary.duration_seconds` 为整次运行耗时；中文总用时行写到 stderr。直接运行 `test-all.sh` 也采用同一计时包装，嵌套执行不会重复打印。

每批报告的 `frontend.json` 和模块 `result.json` 记录本次源码/产物摘要；完整构建日志和产物快照保存在忽略提交的 `spec-tests/.state/frontend/`。
