# 应用级文件拖放上传

## 职责

`file_drop/` 负责桌面浏览器把本地文件拖到终端画面：拦截页面导航、按指针命中 pane 显示落点遮罩、拒绝文件夹，并在松开后把文件交给已有的附件上传与路径粘贴链路。

本模块不拥有附件上传、终端输入、pane registry 或文件选择器 UI。命中 session、激活 pane、上传和路径写入都通过注入命令完成。

## 公开入口

外部只能从 `app/index.js` 导入 `createAppFileDropController()`。控制器公开幂等的 `start()` 和 `dispose()`。

拖放期间遮罩只盖指针下的 `.terminal-host`；松开后遮罩立即移除。文件夹在命中终端时给出说明且不发起上传。非终端区域松开时不上传，同时阻止浏览器打开该文件。

## 状态所有权

`file_drop_controller.js` 是以下状态的唯一 owner：

- started/disposed 与当前遮罩宿主/文案。
- window 捕获阶段的 `dragenter` / `dragover` / `dragleave` / `drop` / `dragend` listener。
- 遮罩 DOM 节点。

View 只创建、移动和移除遮罩节点；lifecycle 只注册和移除 listener；model 只判断文件拖放、目录项和遮罩文案。

## 依赖方向

`global-runtime.js -> app/file_drop -> paste_model 纯函数`，以及注入的 `ingestFiles` / `activateSession` / `resolveSessionAtPoint`。模块不得反向导入 `global-runtime.js`、附件实现、workspace 或终端 transport。

文件上传完成后的路径写入仍由 `app/paste` 的原 pane fence 负责。
