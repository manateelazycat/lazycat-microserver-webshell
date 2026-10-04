---
id: REQ-CODEX-FULLSCREEN-INTERACTION-001
status: draft
---

# Codex 全屏会话使用 WebShell 的滚动与选择操作

## 背景

用户在 WebShell 中运行 Codex 全屏界面时，桌面可以操作，但移动端手指上下滑动无法浏览会话内容。Codex 全屏界面也会处理选中和右键，与 WebShell 已提供的选区及操作菜单发生冲突。

## 需求目标

用户在移动端可通过上下滑动浏览 Codex 全屏会话内容，并通过长按使用 WebShell 的选区和操作栏。桌面用户可继续点击 Codex 界面，拖选和右键则使用 WebShell 的选区及菜单。

## 范围

覆盖 WebShell 中正在运行 Codex 全屏界面的会话，包括移动端触控滚动、长按选择、桌面拖选和右键菜单。进入或退出 Codex 全屏界面时，交互方式随当前界面切换。

## 非目标

不改变其他 TUI、普通终端或 Codex 非全屏界面的交互，也不修改 Codex 程序本身。
