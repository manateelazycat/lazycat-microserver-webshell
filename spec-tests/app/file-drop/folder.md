# 拖入文件夹被拒绝且终端不变

规格：[REQ](../../../spec/app/file-drop/REQ.md) · [AC](../../../spec/app/file-drop/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector app/file-drop/SC-ATTACHMENT-FILE-DROP-FOLDER-REJECT --profile draft`（产品根目录）。

## 场景元数据

- 状态：draft
- 类型：PC / desktopOnly
- 真实依赖：Google Chrome、Provider、附件上传 API
- 相关模块和源码入口：`runtime/static/app/file_drop/`

## 触发条件

用户把文件夹拖到已连接的桌面终端画面并松开。

## 预防的回归

- 用户看到无法上传文件夹的说明。
- 不发起 `/api/attachments`，终端不新增路径。
