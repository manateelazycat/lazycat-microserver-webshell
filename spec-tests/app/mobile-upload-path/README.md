# 移动端选择文件上传成功后路径进入终端

规格：[REQ](../../../spec/app/mobile-upload-path/REQ.md) · [AC](../../../spec/app/mobile-upload-path/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector app/mobile-upload-path/SC-ATTACHMENT-MOBILE-UPLOAD-PATH --profile draft`（产品根目录）。

## 场景元数据

- 状态：draft
- 类型：mobile
- 真实依赖：Google Chrome 移动布局、Provider、persistent agent、PTY、Unified WebSocket、附件上传 API
- 相关模块和源码入口：`runtime/static/attachments/`、`runtime/static/app/paste/`、`runtime/static/global-runtime.js`

## 触发条件

用户在已连接的移动端终端中打开左上角文件管理，选择「上传文件」，在系统文件选择器中选中本地文件。

## 用户可见问题

- 上传成功后只提示路径已复制到剪贴板，用户还要再手动粘贴。
- 手机上复制或粘贴不可用时，上传结果无法进入终端。

## 预防的回归

- 选择文件后出现上传进度，并只发起一次 `/api/attachments`。
- 成功后远端路径只进入当前终端一次，且不自动发送 Enter。
- 进度提示不再要求从剪贴板粘贴路径。
