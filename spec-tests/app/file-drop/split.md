# 分屏时文件进入指针所在的那一侧

规格：[REQ](../../../spec/app/file-drop/REQ.md) · [AC](../../../spec/app/file-drop/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。
单模块：`./run-ac.sh --selector app/file-drop/SC-ATTACHMENT-FILE-DROP-SPLIT-TARGET --profile draft`（产品根目录）。

## 场景元数据

- 状态：draft
- 类型：PC / desktopOnly
- 真实依赖：Google Chrome、Provider、persistent agent、PTY、Unified WebSocket、附件上传 API
- 相关模块和源码入口：`runtime/static/app/file_drop/`、`runtime/static/app/paste/`、`runtime/static/workspace/`

## 触发条件

用户在同一标签中分屏出两个可交互终端，把文件拖到非当前焦点的那一侧并松开。

## 预防的回归

- 拖放遮罩跟随指针所在 pane。
- 上传路径只进入松开的那一侧，另一侧不出现该路径。
