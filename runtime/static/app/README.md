# 应用生命周期模块

`app/` 负责应用级的可复用模块（页面 listener 工具、bootstrap、对话框、命令、快捷键、原生粘贴分流、文件拖放上传和反馈）。全局状态、启动顺序、页面级 handler 组装和跨模块运行时编排统一由同级的 `runtime/static/global-runtime.js` 持有；本目录不再承担根应用 orchestrator。

根应用启动入口是 `runtime/static/main.js` -> `runtime/static/global-runtime.js` 的 `startGlobalRuntime()`；`main.js` 不应直接导入本目录内部模块。

## 文件

- `index.js`：模块唯一公开入口。
- `app_lifecycle.js`：注册并清理页面 `online/offline`、显隐、焦点、页面进入/离开、resize、键盘、触摸恢复和存储心跳监听；以 generation 拒绝字体 ready 等迟到回调。
- `runtime_recovery_controller.js`：online/offline、页面恢复、用户手势恢复、当前 active tab 的单一尺寸 claim、Unified close fence、终端重连范围和网络 banner 的应用级编排；focus/visible/pageshow 不得拆成普通 resize 后再 claim。页面恢复信号通过单飞 resume generation 合并，用户手势可以显式强制恢复；每个恢复代次有独立 2 秒 deadline 诊断，超时仍保持灰色待恢复语义。
- `runtime_recovery_lifecycle.js`：网络切换异步 generation、前台恢复短窗口合并、用户恢复节流和 dispose fence，拒绝离线后的迟到 close-wait 回调。
- `mobile_select_controller.js`：移动端原生 `select` 替代弹层、选项事件、定位和焦点/RAF 资源；不拥有设置值或业务状态。
- `dialog_controller.js`：桌面确认/输入对话框与移动关闭确认 sheet 的 resolver、焦点、事件和 dispose 生命周期；不拥有业务操作状态。
- `feedback/`：toast 和启动错误面板的 DOM 状态、timer 与销毁生命周期；不拥有错误或业务状态。
- `commands/`：移动快捷键和页面外壳按钮的应用命令路由、新建 tab 及 shell listener；只调用注入的公开命令，不拥有业务状态。
- `dom_registry.js`：一次解析并校验页面外壳 DOM，按 workspace、dialog、mobile、startup 分组返回只读引用；不注册事件、不拥有业务状态。
- `shortcuts/`：桌面快捷键动作映射、过滤和全屏命令；只通过显式回调调用业务模块，不拥有业务状态。
- `paste/`：原生 `paste` 事件的文件优先/文本降级分流、上传 continuation 和原 pane generation fence；只调用注入的附件上传与终端输入命令，不主动读取剪贴板。
- `file_drop/`：桌面文件拖放到终端画面的落点遮罩、文件夹拒绝和 drop 消费；命中 pane 后把文件交给 paste 的 `handleDroppedFiles()`，不拥有上传或路径输入。
- `server_revision/`：稳定 client ID、版本检查、部署重载提示及首次检查 timer；更新提示不拥有也不修改终端输入状态。
- `agent_protocol_update/`：消费 Unified Queue 首次握手中的 Agent 当前/推荐协议版本，在终端右上角显示一次待更新提示；只有用户通过危险确认对话框明确同意后才请求 scoped Agent 更新，失败时保留提示。该模块不创建输入锁、不轮询、不按 pane 重复检测，也不自行替换 Agent。
- `bootstrap/`：应用启动事务、启动失败呈现和旧 PWA/Cache API 一次性迁移清理；同时保存由 Provider 在旧 URL 提供的退役 Worker 源码。`index.html` 只对仍受旧 Worker 控制的页面触发现有 registration 更新，不导入或注册 Worker。模块不申请浏览器持久存储，只接收显式依赖，不实现业务模块。
- `global-runtime.js`（目录外）：唯一的全局 runtime owner；创建本目录和其他 feature controller，编排启动、恢复、页面生命周期和统一销毁。

## 边界与生命周期

对话框模块通过 `confirmDialog()`、`promptDialog()`、`confirmMobileSheet()`、`confirmMobileClose()` 和 `confirmCloseRunningCommand()` 提供用户意图结果；`handleEscape()`、`install()` 与 `dispose()` 负责事件和资源生命周期。调用方只负责根据结果执行删除、重启或重命名，不得直接修改对话框 DOM 或 resolver。

`createAppLifecycle` 的 `start()`、`dispose()` 幂等。所有 listener、字体 Promise、heartbeat timer 都由本模块清理；具体行为通过 `handlers` 注入。模块不建立 WebSocket、不执行历史 replay、不清空或显示终端 Canvas，也不直接修改任何 feature controller 的状态。

`commands/` 的 `createAppCommandController` 通过 `runAction()` 和 `createUserTab()` 发布应用意图，`install()` 负责新建 tab、空状态按钮和标签栏滚轮 listener；`command_lifecycle.js` 负责 listener 清理和 dispose generation。命令模块不直接读取或修改终端、history、replay、resize 或 Canvas 状态。

`paste/` 的 `createAppPasteController` 是原生 paste 分流的唯一 owner。文件数据存在时优先上传并拒绝同事件派生文本；上传完成后只有触发时的 session 仍由 workspace registry 持有、实例未切换且 controller generation 有效，才能把无 CR/LF 的路径参数发送回原 pane。IME 和 session installation 只转发原生事件，不复制文件/MIME 判断。移动端文件选择器成功后的路径写入复用 `handleDroppedFiles()`，不在附件模块内直接发送终端输入。

`file_drop/` 的 `createAppFileDropController` 是页面级文件拖放的唯一 owner。它只在命中可交互 pane 时显示遮罩并在松开后把文件交给 paste；文件夹与非终端落点不得发起上传，同时必须拦住浏览器打开该文件。

## 依赖与验证

外部只能从 `app/index.js` 导入本目录模块；根启动从 `global-runtime.js` 进入。新增页面级事件必须先归入本目录或明确的 feature 模块，并增加生命周期清理测试。相关回归包括 `app_lifecycle_controller_test.mjs`、`app_paste_controller_test.mjs`、页面显隐/网络恢复测试、`spec-tests/app/paste/`、`spec-tests/app/file-drop/`、`spec-tests/app/mobile-upload-path/`，以及 `main.js`/`global-runtime.js` 入口边界 guard。
