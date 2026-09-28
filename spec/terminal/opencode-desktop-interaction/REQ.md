---
id: REQ-OPENCODE-DESKTOP-INTERACTION-001
status: draft
---

# opencode 桌面终端使用 WebShell 的选区和右键菜单

## 背景

用户在 WebShell 的桌面终端运行 opencode 时，拖选文字会进入 opencode 自带的选择与复制操作，右键不能打开 WebShell 的操作菜单，无法使用与其他终端一致的复制和菜单操作。

## 需求目标

桌面用户可以在 opencode 界面普通左键点击，拖选文字时使用 WebShell 选区和复制操作，右键时打开 WebShell 菜单。原有上下滚动仍可使用。

## 范围

覆盖 WebShell 中正在运行且接收鼠标输入的 opencode 桌面会话。按当前会话状态切换事件归属，退出 opencode 后恢复普通终端交互。

## 非目标

不改变 opencode 的移动端触控操作、其他 TUI 或普通终端的鼠标行为，也不修改 opencode 程序本身。
