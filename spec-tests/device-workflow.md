# 根据发布场景编写真实操作流程

## 当前工具

- 官方 skill：`agent-device`，来源 `callstack/agent-device` 的 `skills/agent-device`，提交 `233a34d1380e59c4816595787f3069a8f448de96`。已安装到当前用户 Codex skills；后续新轮次可自动发现。
- CLI / Node API：`agent-device@0.20.10`，由本项目 package-lock 锁定。
- 使用 `./device`，它注入本机 Android SDK/AVD 路径，并使用独立用户缓存存放 agent-device 状态。环境变量覆盖默认路径，项目里不保存设备序列号。
- web 的 managed backend 已完成安装和 doctor；Android 已发现本地 AVD，尚无已启动模拟器或已连接物理设备。本记录不表示产品 AC 已通过。

## 发布目标

配置真源为 `release-targets.json`。

| 目标 | 设备与使用方式 | 验证重点 |
| --- | --- | --- |
| desktop-browser | 实际桌面浏览器；agent-device web 用于现场操作与流程制作 | 键盘、终端画面、标签操作 |
| android-emulator | 指定 Android AVD 中的真实 Chrome 和系统键盘 | 触摸、键盘遮挡、系统 IME 与候选词 |
| android-device | 指定且已授权的 Android 物理设备 | 发布前验收、硬件或厂商系统差异 |

`WEBSHELL_ANDROID_SERIAL` 或 `WEBSHELL_ANDROID_DEVICE` 指定一个目标。缺失、歧义或设备类型不匹配时失败，不能从物理设备静默切换到模拟器。模拟器与物理设备证据分别标明；浏览器移动视口不算 Android 验证。

## 每个 AC 的制作顺序

1. 用产品侧 `spec-tests/task-context --ac <SC-ID>` 或 `--module <模块目录名>` 取得当前合同，先读 ENVIRONMENT.md，再按需要补读目标设备材料。然后只读 agent-device skill 和本设备需要的 `help` topic。
2. 按发布目标绑定设备和获授权地址。普通操作直接 `open ... --foreground` 获得初始交互快照；环境初始化、设备选择和脚本语法不确定时才查询对应帮助。
3. 用当前快照的 ref 或稳定 label/id/role 执行真实点击、触摸、输入和滚动，动作后用 settle 的差量继续。快照缺少下一目标时才重新取快照；画布或可访问性信息不足时查看截图。
4. 将已验证的操作整理为 `scenarios/<name>.mjs`（官方 Node API）或原生 `.ad` replay。交互 ref 只用于当前快照，持久脚本使用稳定选择器或运行时解析，不能硬编码旧 ref。
5. 将每个 Then/And 对应到独立可判定的外部结果；等待明确状态并设置期限，不能仅凭脚本无异常或 settle 返回就通过。
6. 精确选择该 AC 真实运行并保存结果、截图、设备类型和失败步骤；达到合同后才调整 Profile。流程失败则修复对应步骤，其他场景不重复加载。

## Android 原生输入法

Android 模拟器默认的 agent-device 测试 IME 适合文字注入，但不能作为系统输入法证据。原生 IME 场景用 `open --no-test-ime`；Node 环境封装已使用 `testIme: false`。实际操作系统键盘、拼音候选、确认提交及退格，并观察终端最终文字。`fill`、`type`、ADB 文字注入和 DOM composition 事件不能替代这些操作。

## 代码和环境边界

`environment/agent-device.mjs` 保留设备工具配置；`withDeviceSession` 当前明确拒绝未经本地前端绑定的自动流程。后续接入时，设备选择、操作和释放仍由环境层负责，AC 判定由执行器负责。

已抽出的 Playwright 环境继续承接需要多页面、真实后端认证和静态产物替换的浏览器验收；agent-device web 目前不提供多页面编排、网络路由和 cookie/storage 管理。按实际能力复用两者，均通过产品侧唯一执行器归一化结果。

自动验收必须使用当前本地构建。agent-device 尚未接入可验证的本地前端通道，因此 `withDeviceSession` 以及项目 `device` 包装器的 open/replay/test/batch/mcp 执行目前明确失败，不能改测已部署旧前端。设备发现、doctor、web setup 和帮助保留可用；接入本地前端通道后才能恢复这些自动测试入口。

认证从本地配置注入，不把凭据写进录制脚本。现场录制使用变量占位或排除认证步骤，首次运行后检查脚本及报告再提交。临时截图、session 数据和设备标识留在被忽略的产物目录。

参考：[官方 skill](https://github.com/callstack/agent-device/tree/233a34d1380e59c4816595787f3069a8f448de96/skills/agent-device)、[Node API](https://oss.callstack.com/agent-device/docs/client-api)。以本项目锁定版本的 `./device help <topic>` 为命令参数依据。
