# 图片、文件与上传路径原生粘贴回归

规格：[REQ](../../../spec/webshell/16-attachment-native-paste/REQ.md) · [AC](../../../spec/webshell/16-attachment-native-paste/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector webshell/16-attachment-native-paste`（产品根目录）。

## 场景元数据

- 状态：active
- 类型：PC / mobile / lifecycle
- 真实依赖：Google Chrome、系统剪贴板、Provider、persistent agent、PTY、Unified WebSocket、附件上传 API
- 相关模块和源码入口：`runtime/static/app/paste/`、`runtime/static/attachments/`、`runtime/static/terminal/input/ime/`、`runtime/static/terminal/interaction/`、`runtime/static/terminal/session/`、`runtime/static/global-runtime.js`

## 触发条件

用户在已经连接真实终端的 PC 或移动布局页面中执行以下操作之一：

1. 把普通文本通过系统粘贴输入终端。
2. 把剪贴板中的图片或文件粘贴到终端。
3. 在桌面端通过附件文件选择器手动上传，等待远端路径复制成功后，不额外点击终端便立即执行系统粘贴。移动端文件选择器成功后自动写入路径由 `25-attachment-mobile-upload-path` 验收。
4. 在主动读取剪贴板受到浏览器或宿主策略限制时点击菜单中的粘贴动作。

## 用户可见问题

- 图片或文件粘贴后没有上传、没有路径输入，也没有错误提示。
- 手动上传成功且提示路径已复制后，紧接着粘贴仍可能完全没有反应。
- PC 与移动端的菜单粘贴依赖主动 `clipboard-read`，宿主拒绝权限时无法形成可靠降级。

## 预防的回归

- 原生文本粘贴只向触发操作的 pane 发送一次，保留 bracketed paste，不能被 `beforeinput` 重复发送。
- 原生图片或文件粘贴必须只上传一次，并把返回路径只输入触发操作的原 pane 一次，不自动发送 Enter。
- 文件数据优先于同一剪贴板项目携带的派生文本，不能同时触发附件上传和文本发送。
- 手动文件选择完成或取消后，隐藏的 file input 不能继续吞掉终端粘贴快捷键。
- 主动读取剪贴板被拒绝时必须给出可操作反馈，并把焦点交给终端的系统粘贴目标。
- pane/tab 关闭、实例切换或应用销毁后，上传迟到结果不得进入其他终端。
- 终端输入、IME、resize、Canvas 和单页 Unified 物理 WebSocket 数量不能回归。

## 修复前基线

- 第一次运行日期：2026-09-04。
- 第一次结果：环境失败，未进入粘贴步骤。Chrome 150 报告 `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`，desktop/mobile 的 Unified WebSocket 持续重连，活动 pane 未进入 `open`。
- 第一次产物：`artifacts/2026-09-04T08-40-06-828Z/`，包含失败截图、trace、JSONL、terminal timeline 和 presentation probe。
- 环境处理：真实测试运行器在创建页面前仅向目标测试 origin 授予 `local-network-access` 权限，不使用 `--disable-web-security` 或全局关闭 Local Network Access 检查。
- 目标功能基线：失败，产物为 `artifacts/2026-09-04T08-43-15-000Z/`。desktop 的系统文本粘贴先成功；随后 Chrome 向活动终端 textarea 产生了包含 `image.png` 的原生 paste，观察到 `files=1`、`items=[{kind:"file",type:"image/png"}]`、`textLength=0`，但 15 秒内没有任何 `/api/attachments` POST。这证明修复前缺口位于原生文件事件到附件上传之间，而不是 Clipboard 写入、终端焦点、Provider 或 PTY。
- 计划命令：

```sh
npm run build
HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node tests-auto/run-playwright.mjs tests-auto/16-attachment-native-paste/test.mjs
```

- 预期失败指标：真实 Chrome 向终端 textarea 产生携带图片的原生 `paste` 事件后，没有发起附件上传请求，且没有终端输入 payload。
- 基线必须记录实际目标实例、desktop/mobile 浏览器上下文、静态资源来源、Clipboard API 能力、活动元素、上传请求数、输入 payload 和失败产物路径。

## 已确认根因

代码审计已确认以下边界缺口，真实浏览器基线用于确认它们在目标环境中的实际表现：

1. IME textarea 与 terminal host 的原生 `paste` 监听器只读取 `text/plain`，没有读取 `clipboardData.items/files`，也没有调用附件上传。
2. “从剪贴板导入附件”和菜单粘贴依赖 `navigator.clipboard.read/readText`；写剪贴板成功不代表宿主允许主动读取。
3. 文件选择器 `change/cancel` 后没有恢复终端焦点，而快捷键控制器会跳过普通 input 目标。
4. 现有真实场景只人工派发文本 paste，没有覆盖系统图片剪贴板、真实附件 API、文件选择器焦点和上传完成后的目标 pane fence。

## 实施方案

- 新建 `runtime/static/app/paste/`，由 controller 唯一消费原生 paste、执行文件优先/文本降级、阻止重复事件，并以 dispose generation 和原 session 有效性 fence 异步上传结果。
- `attachments_controller.js` 新增 `uploadPastedFiles()` 可等待入口；上传记录仍绑定创建时实例/tab，成功结果返回路径，取消、切换和 dispose 会 settle 并拒绝迟到工作。
- paste 上传不再执行一次无意义的剪贴板复制往返；远端路径经过无 CR/LF 的 POSIX 参数格式化后，通过 terminal clipboard/input controller 发送到原 pane，不自动发送 Enter。
- IME textarea 和 terminal host 只把 paste 事件转发给应用 paste controller；IME 继续维护 paste/beforeinput 文本去重。
- 文件选择器 change/cancel 后释放隐藏 input 焦点并恢复终端；快捷键控制器只对附件 file input 开放有界原生粘贴重定向，普通表单仍保持默认行为。
- 主动 `clipboard-read` 权限错误不再被附件适配器吞掉；菜单粘贴失败会显示可操作提示并聚焦原生 paste 目标。
- `tests-auto/run-playwright.mjs` 在页面创建前仅为测试目标 origin 授予 Chrome 150+ 的 `local-network-access` 权限，恢复真实 Provider WebSocket，不关闭浏览器安全特性。
- 同步更新应用、附件、输入/IME、交互、session 模块 README 和 `docs/ARCHITECTURE_AND_MODULE_MAP.md`，记录新的事件 owner、依赖方向和清理边界。

## 验证预期

- desktop 和 mobile 均连接真实 Provider、persistent agent 和 PTY。
- 系统文本粘贴只发送一次。
- 系统图片粘贴发起一次真实 `/api/attachments` 请求，成功后路径只进入原 pane 一次且 payload 不包含 Enter。
- 浏览器无法把任意文件 MIME 写入系统剪贴板时，使用真实浏览器 `ClipboardEvent + DataTransfer(File)` 锁定通用文件分支，并在已知限制中保留真机文件剪贴板步骤。
- 手动上传后无需额外点击终端即可粘贴已复制路径。
- active pane 关闭后，迟到上传结果不产生输入。
- 每个页面只有一条活动 Unified 物理 WebSocket；Canvas 非空；console error、pageerror 和 API error 为零。

## 运行命令和环境变量

构建并映射当前前端产物：

```sh
npm run build
HEADLESS=1 WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node tests-auto/run-playwright.mjs tests-auto/16-attachment-native-paste/test.mjs
```

默认前台/真机式运行沿用 `tests-auto/.env`：

```sh
WEBSHELL_LOCAL_STATIC_DIR="$PWD/build/runtime/static" \
node tests-auto/run-playwright.mjs tests-auto/16-attachment-native-paste/test.mjs
```

## 产物与失败诊断

- 运行器把 `events.jsonl`、`error.txt`、desktop/mobile 截图、trace、terminal timeline 和 presentation probe 写入本目录的 `artifacts/<时间戳>/`。
- 场景额外记录 Clipboard API 能力、活动元素、附件请求响应、远端路径、终端输入 payload、Canvas 摘要和 Unified WebSocket 数量。
- 失败后必须结合 trace、截图、JSONL、API 响应、console/pageerror 和源码证据判断，不能通过放宽断言或增加固定等待绕过。
- 修复后核心场景首次通过：`artifacts/2026-09-04T08-48-24-274Z/`。
- 扩展双文件和权限降级后曾有一次环境初始化失败：`artifacts/2026-09-04T08-53-08-883Z/`。该次 desktop/mobile Unified WebSocket 均已 open，但隔离 pane 的 presentation/connection DOM 状态未在 60 秒内提交，测试尚未进入任何粘贴步骤；没有修改断言或等待时间。
- 最终自动化通过：`artifacts/2026-09-04T09-06-04-709Z/`。desktop/mobile 均使用安全上下文和 Chrome 系统剪贴板完成文本与真实 PNG 粘贴；每端一次 DataTransfer 事件上传两个通用文件；隐藏 `attachmentFileInput` 持有焦点时仍能粘贴手动上传路径；desktop 主动读取拒绝时显示策略提示并把焦点恢复到 textarea。
- 最终路径输入 payload 均只包含每条远端路径一次且没有 CR/LF；desktop Canvas 为 `1440x861`、mobile Canvas 为 `390x714`，均有非透明像素；每页 Unified WebSocket 为 `created=1, active=1`。console error、pageerror 和未预期 API error 为零，测试清理了远端临时文件和隔离 tab。
- 行为/构建验证：`npm run build` 通过，Vite 产物为 4 个 JavaScript 文件；`node --test tests/*.mjs` 共 432 项通过；`go test ./... -count=1` 通过；`git diff --check` 通过。
- 2026-09-04 用户确认手动测试通过。对话未提供具体设备型号、系统和浏览器版本，因此这里记录为用户报告，不替代下述真实移动设备元数据限制。
- 本轮预检 `artifacts/2026-09-04T10-40-16-339Z/` 在任何 paste 动作前等待 desktop `data-connection=open` 超时；desktop/mobile active pane 都已 `renderReady=true`、`hasPresentedFrame=true`、Canvas 非空，mobile 为 open，desktop 仅被 resume deadline 留下 `data-connection=reconnecting` 且实际 retry=false。判定为过时展示属性前置，不是附件/paste 失败。
- 场景前置改为 terminal host 可见、稳定 presentation 和非空 Canvas；后续系统文本、PNG、DataTransfer 双文件、手动上传后路径粘贴、权限降级、原 pane fence、远端清理和 Unified socket 断言全部保留，因此真实 paste 或连接问题不会被放宽。
- 完整回归 `artifacts/2026-09-04T11-09-18-503Z/` 的所有 paste/upload 断言及每批首次 `rm -f` 清理均通过，但 `finally` 对已清理路径再次执行重复清理；mobile textarea 此时已失焦，cleanup marker 超时并被旧代码只记录 error 后吞掉。测试现在成功清理后立即移出 pending 列表、cleanup 前显式聚焦 textarea，并让任何最终 cleanup failure 直接使场景失败。
- 修正后独立通过，并在最终全量的 `artifacts/2026-09-04T11-17-03-295Z/` 再次通过全部 PC/mobile paste/upload/权限降级/原 pane/socket/Canvas 断言；远端附件和隔离 tab 清理完成，事件日志无 cleanup error。

## 已知限制

- Playwright 的 mobile context 是桌面 Chrome 的移动布局与触控模拟，不等同于 Android/iOS 系统剪贴板实现；正式完成前仍需依据环境能力执行真实移动设备步骤，或在本节记录无法自动化的明确原因和结果。
- Chromium 通常允许通过 Async Clipboard 写入 PNG，但不保证允许写入任意文件 MIME。通用文件分支可以在真实浏览器中通过 `DataTransfer(File)` 验证，系统文件管理器复制文件仍需真机补充验证。
- 本场景会在真实目标创建临时附件；测试必须在 `finally` 中通过原 pane 清理远端文件，并关闭运行器创建的隔离 tab/context。
- 用户已报告手动验证通过，但未提供可归档的 Android/iOS 设备、宿主版本或系统文件管理器复制文件记录；因此不能宣称这些具体设备组合已由自动化完全覆盖。
- 完整 `./tests-auto/test-all.sh` 结果以本轮最终验证记录为准。
