# 拖到目标终端后完成上传并写入路径

规格：[REQ](../../../spec/app/file-drop/REQ.md) · [AC](../../../spec/app/file-drop/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector app/file-drop/SC-ATTACHMENT-FILE-DROP-PANE --profile draft`（产品根目录）。

## 场景元数据

- 状态：draft
- 类型：PC / desktopOnly
- 真实依赖：Google Chrome、Provider、persistent agent、PTY、Unified WebSocket、附件上传 API
- 相关模块和源码入口：`runtime/static/app/file_drop/`、`runtime/static/app/paste/`、`runtime/static/attachments/`、`runtime/static/global-runtime.js`

## 触发条件

用户在已连接的桌面终端中把本地文件拖到终端画面并松开。

## 用户可见问题

- 拖到终端没有可放下的确认，松开后也没有上传进度。
- 文件没有上传，或路径没有进入松开时所在的终端。

## 预防的回归

- 拖动期间目标 pane 显示遮罩和文件名。
- 松开后出现上传进度面板，并只发起一次 `/api/attachments`。
- 成功后远端路径只进入该终端一次，且不自动发送 Enter。
- 拖到非终端区域时页面不离开 WebShell，也不上传。
