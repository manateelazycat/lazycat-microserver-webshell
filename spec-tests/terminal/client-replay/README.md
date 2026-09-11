# 客户端多标签大历史回放恢复

规格：[REQ](../../../spec/terminal/client-replay/REQ.md) · [AC](../../../spec/terminal/client-replay/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector terminal/client-replay`（产品根目录）。

## 场景元数据
- 状态：blocked（缺少获授权的在线 `client:` 测试目标；补丁与包已生成）
- 类型：PC / lifecycle
- 真实依赖：真实 `client:` PC terminal service、Provider、PTY、独立 Fast WebSocket、Chrome、Ghostty WASM；测试终端需 POSIX shell 与 python3 生成受控的小块输出。
- 相关模块和源码入口：`terminal/output/README.md`、`terminal/rendering/README.md`、`terminal/transport/README.md`、`terminal/history/README.md`（均位于 `runtime/static/`）；对应 `output_controller.js`、`presentation_controller.js`、`session_connection_lifecycle.js`、`session_connection_controller.js` 和 `session_replay_controller.js`。
- 与已有场景的区别：05/06 主要验证容器 Unified 实时输出与新建标签；本场景验证 `client:` 原始小帧历史在刷新和多标签恢复时的消费与首次呈现。

## 触发条件
真实客户端创建三个专用测试 tab，第一个保留短输出，第二、第三个生成约 1.75 MiB 的大量小块输出。刷新页面后依次切换三个 tab，再重连并输入独立 marker。保留原用户 tab，仅清理测试创建的资源。

## 用户可见问题
首个 tab 可用，其他 tab 内容短暂闪现后黑屏；连接反复在历史回放尚未提交时超时。

## 预防的回归
- 小帧历史不会因每轮 8 条的消费限额导致 attach 超时循环。
- 接收 cursor、应用 cursor 与最终呈现保持顺序及当前连接身份，不因重连丢弃正常进行中的回放。
- replay 尚未提交时不得把 live Canvas 提前暴露；有已提交旧帧时仅显示有效 hold。
- 三个 tab 分别完成真实输入回显、非背景 Canvas 呈现，无串内容。
- 正常进展有界等待，真正停滞及持续输出仍受总时限约束；旧 generation 回调失效。

## 修复前基线
用户提供 `/tmp/hello.txt`：每轮 1,749,980 字节 / 16,324 帧；收到完成通知时仍有约 1 MiB 队列；第三次连接约 8038ms 后超时，尚有 457,802 字节未应用；记录到 `restoreReady:false` 后 `ready:true`。此日志作为调查证据，不复制真实 target、认证或终端内容到仓库。
2026-09-06：运行上述命令并设置 `DISPLAY=:0`，Chrome 前台登录成功，但测试账号的实例列表只有普通容器、没有 `client:` 终端，明确报 `CLIENT_TARGET_UNAVAILABLE`。产物 `artifacts/2026-09-06T15-00-57-261Z/` 保存截图、trace、JSONL 和错误摘要。此为已确认的环境前置失败，尚未触及客户故障路径；已请求补充获授权的客户端 URL，允许继续进行独立修复及容器回归，不声称客户端通过。
同日 `node --test tests/terminal_output_controller_test.mjs tests/terminal_presentation_controller_test.mjs tests/terminal_session_connection_controller_test.mjs` 得到 24 通过 / 5 失败。`artifacts/node-baseline.txt` 锁定小帧吞吐、实际写入耗时预算、restoreReady、进展超时和同 socket 旧 timer 五个风险不变量，作为无法访问客户端时的最小基线。
开发基线：HEAD `432c9c1`，包版本 `1.0.39`，另包含实施前已有的 42 个 tracked 文件差异；已有差异已在本机私有临时目录备份。本次修改单独审计。

## 已确认根因
源码与修复前行为测试确认：output 默认每轮最多消费 8 个队列条目，且时间预算只检查分区、不包含实际解析；attach timer 与健康检查各自固定等待 8 秒；presentation `cancelHold()` 无条件设置 ready，忽略 `restoreReady`。同 socket 被替换的旧 attach timer 也缺少 watch identity fence。客户设备的实际复现仍受环境前置限制。

## 实施方案
回放取消默认 8 条上限，按 512 KiB / 12ms 分轮、32 KiB 分次写入并检查实际耗时；保留显式 resize maxEntries、顺序/cursor 和 stale generation 边界。attach lifecycle 统一拥有有效进展和 8 秒停滞 / 60 秒总期限，健康检查复用该 owner，重复 preparing 不延长总期限。取消 hold 只有在显式请求、已有提交画面及当前门禁全部满足时恢复 ready/释放旧帧。
修改文件：output/output_controller.js、rendering/presentation_controller.js、transport/session_connection_lifecycle.js、transport/session_connection_controller.js；对应模块 README、架构导航、Node 行为测试和 Go health guard 同步更新。runner 支持 client 选择、场景启动前 probe、desktop-only 及初始化失败时的资源/产物清理。
真实测试只增加历史保留量，结束时恢复原设置；冷恢复前只清理本次专用浏览器 context 的 IndexedDB，不清服务端历史或客户自己的浏览器。终端内容来自真实 PTY，不修改网络 payload。

## 验证预期
真实客户端恢复三个 tab 并完成输入回显；无 attach 超时循环、回放中间帧泄露、输出丢失或兄弟 pane 干扰；每页直连数不超过既有配额。首轮运行必须记录实际 replay 字节/帧数量，数量不足不得冒充日志中的大历史场景通过。

## 运行命令和环境变量
```sh
npm run build
WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node spec-tests/run-playwright.mjs spec-tests/terminal/client-replay/test.mjs
```
认证仅从 `spec-tests/.env` 或进程环境读取。可用 `WEBSHELL_CLIENT_TEST_URL` 指定有权测试的 `client:` 目标；没有可用真实客户端时明确失败，不回退到普通容器。前台运行需要可访问的 DISPLAY。

## 产物与失败诊断
`artifacts/<run-id>/` 保存事件 JSONL、截图、trace、逐帧 presentation probe、终端时间线、实际 replay 字节/帧统计和错误摘要。失败优先关联 cursor 进展、连接世代、ready/hold 状态与非背景像素，不通过删断言或增加固定等待制造通过。

## 已知限制

2026-09-07 最新结果：共用输出队列此前按每轮 8 条原始消息限流，约 110 字节的小消息造成积压。改为合并后的写入批次数限制后，本模块完整通过（104.588 秒）；三个标签恢复、两份约 1.8 MB 且各超过 1.6 万帧的真实历史及后续输入均验证通过。第 05 项相关回归也通过。详见 [根因与修复](../../../reports/client-output-batching-fix.md)。以下内容保留为历史排查记录。

2026-09-07 客户端已上线后复测：先修正准备/恢复设置所用的 HTTP 方法为真实接口的 PUT；随后在首份大历史生成阶段发现输出已收完但画面未推进，呈现等待超时。已不再是缺少客户端；详细原因和截图见 [复测记录](../../../reports/geometry-and-client-recheck.md)。下述早期“没有客户端”的记录是历史状态。
测试环境的实例列表没有获授权的在线 `client:` PC 终端。补丁后原样重跑仍在客户端前置失败，产物 `artifacts/2026-09-06T15-23-13-448Z/`；不得将容器回归或 Node 测试当成客户端实际通过。

最小人工验证步骤：在获授权的专用客户端测试 workspace 建立三个 tab，第一个保持短输出，另外两个分别生成约 1.75 MiB / 上万个小块输出；保留各自独立结束 marker；使用新的浏览器临时配置进入并依次切换三个 tab，再返回原 tab 输入新的唯一 marker。预期每个 tab 均显示正确终端内容并回显输入；回放期间只显示有效旧帧或尚未就绪的背景，不闪现中间帧、不发生 8 秒重连循环。同步导出各 pane 的 received/applied/presented cursor、replay 帧数、截图和连接时间线，并清理测试 tab/进程。当前无人执行这组客户设备步骤，不能标记完全验证。

后续自动化计划：配置 `WEBSHELL_CLIENT_TEST_URL` 和测试账号权限、保持客户端在线且有 POSIX shell/python3 后，原样运行上面的命令；确认大历史和帧数门槛、原始失败路径与修复后通过，再将状态改为 active。既有容器场景继续走其 Unified 协议和单物理连接要求。

## 验证结果

- `node --test tests/*_test.mjs`：446 项通过、0 失败。`artifacts/node-all-final.txt`；修复前五项风险断言的失败证据保留在 `node-baseline.txt`，后续增加 snapshot cursor 基线、心跳不能续期、agent preparing 总时限及写入回调重入/退役测试。
- `go test ./...`：全部通过，见 `artifacts/go-all-after-review.txt`。旧 health guard 对固定 8 秒代码文本的检查已替换为统一 watchdog 入口、私有 owner 和绝对期限检查；对应实际行为由 Node 测试覆盖，未跳过 Go guard。
- 真实 Chrome 前台、真实 Provider/agent/PTY/WebSocket，映射当前 Vite build：01–16 均有通过记录，完整清单在 `artifacts/verification-summary.json`。05 输出与 06 标签先独立通过，再通过全量中的对应步骤。
- `DISPLAY=:0 ./spec-tests/test-all.sh` 第一次在 09 前置混入设备接管时失败；依据 trace/截图修正同设备前置后，09 独立通过。第二次在 03 的登录门户翻译资源临时网络故障处停止；03 保留原断言独立重跑通过，再按编号运行剩余 10–17（11 保持无本地资源映射）。两次失败及对照均保留，不能把它们写成一次 17/17 全绿。03/09 的调查与修正记录在各自 README。
- 17：客户端前置失败，核心用户故障尚未在真实客户端复现/验证；已实现的 test.mjs 尚待这一环境解除后执行完整路径。
- `lzc-cli project lint`：无警告；`lzc-cli project release -o dist/cloud.lazycat.webshell.lcmd-1.0.40-replay-hotfix.lpk`：成功。包为 linux/amd64，版本 1.0.40，39,309,824 字节；包内 10 个前端文件逐一与浏览器测试的资源 SHA-256 一致，内容 revision 独立重算一致，Cookie 认证开启，未嵌入测试文件或认证信息。
- LPK SHA-256：`2d51aff39ca0d40470c65a66181f590bf5312f843f1c8ff23ed43a67f37ec9f1`。包校验结果在 `artifacts/lpk-verification.json`。
- 本轮仅生成本地补丁与安装包，未向客户设备安装、重启服务或发布应用商店；现有工作区的未提交修改保留。交付包基于当前工作区，包含实施前已有的 resize 连接迁移等改动，本次业务补丁集中在 output/rendering/transport 四个控制器文件。

## 旧帧回归观察

稳定状态新增检查 hold 覆盖层已退出，避免底层 Canvas 已绘制但仍被旧帧遮住时假通过。本轮仅获授权测试 debug 容器，未运行真实 client: 目标；不宣称客户端验证完成。
