# 短暂断网后原终端恢复实时画面

## 场景与边界

真实 Provider、persistent agent、PTY 和 WebSocket；桌面 Chrome 及移动视口分别记录。测试只操作专用标签，另一个独立标签作为对照。网络由浏览器真实离线模式切断，不构造终端数据、协议响应或内部 session 状态。

用户报告：断网重试或离线后返回，旧终端长期停在旧画面；展开键盘时旧内容随容器缩放，其他会话仍正常。

## 验收

- 短暂离线后原标签无需刷新或重建即可恢复实时输出。
- 恢复后的新命令结果出现在实际截图中，保帧覆盖层已退出。
- 持续输出期间恢复也必须推进可见画面；切换标签和移动视口变化后仍可输入。
- 独立会话在另一个浏览器窗口保持可交互。

## 基线与调查

多轮真实环境调查后仍未稳定复现永久旧帧，按用户要求留档并停止追加轮次。保帧 identity、释放门禁和 client 通道恢复接线仍只是审计线索，相关未验证候选修改已撤回。

## 运行

从 WebShell 根目录执行：

    node spec-tests/run-playwright.mjs spec-tests/investigations/network-presentation-recovery/test.mjs

凭据及明确实例沿用未提交配置。LPK 集成验收另由父项目执行器核验实际设备文件；本场景的浏览器当前前端映射不单独证明后端部署版本。

## 证据与清理

记录网络动作、截图/OCR、trace、呈现探针和 JSONL。注入离线期间的精确 ERR_INTERNET_DISCONNECTED 是预期网络结果并保留日志；其他 console/pageerror/API 错误仍失败。恢复网络并关闭本场景创建的标签，终止其输出进程。

## 已知限制

移动视口不是物理手机或系统键盘；真实 Android/iOS 键盘尚待对应设备。测试不通过修改 history generation 或伪造协议事件制造失败。

### 基线环境故障

父项目 reports/3fae5b1e6cd543258f9ebcda51a88538：设备上全部 23 个文件及两个运行进程与当前 LPK 一致；首条命令截图可见，尚未进入断网时 OCR 因缺少 eng.traineddata 失败。模型补齐后重跑原产品断言。浏览器通过正常调试开关关闭日志浮层，console 和 timeline 仍完整采集，避免调试 UI 遮住待识别终端。

父项目 reports/d0f06871dd1a487a81cd41a420a4c475：前置两窗口命令截图/OCR 已通过，debug 容器没有 python3，输出负载未启动，未进入断网步骤。截图明确记录 command not found；负载改为该真实 Bash/printf/sleep 链路直接产生相同递增输出，不增加容器依赖，产品恢复断言保持不变。

### 首次真实产品基线

父项目 reports/6b50bcf61d0843bbb22a8b5eb4edbcc4：修复前短暂断网恢复通过，57.886 秒；包含真实截图/OCR 的递增输出、新输入、独立会话和移动视口变化。没有复现永久卡死，不把这次通过当作已排除异常 identity 分支。继续把离线窗口明确延长至 15 秒（越过 8 秒 attach/12 秒 connect 窗口），并通过真实浏览器后台标签切换覆盖离线后返回；该 15 秒是故障持续时间，不是增加等待以取得通过。

### 长离线与大量历史

用户补充必须先有大量历史并断网至少 10 秒。场景现在先生成 18,000 行、约 1.96 MB 真实 PTY 输出，临时提高历史保留到至少 6000 行并在 finally 恢复原设置；重连实际 history-replay-start 的范围必须至少 1.5 MB，不能仅凭生成命令推断存在历史。网络离线至少 20 秒，同时冻结真实 Chrome 页面执行，再解除冻结和恢复网络。

reports/8370fc46ff1249caa65a797b5b84073b 的真实 Chrome 新页面没有让原页 document.hidden 变成 true，trace 记录该前提超时、尚未进入长离线等待。改用 CDP Page.setWebLifecycleState 的真实冻结/恢复操作，不派发虚假的 visibility 事件；它覆盖页面暂停执行，不能等同 Android/iOS 原生后台挂起。

reports/ffad943584984284988e8973de00abf8：前置原始截图确有 BEFORE572070END，但 OCR 读成 BEFORES72070END。用保留的同一失败截图做灰度/反色/3 倍最近邻放大后，识别为精确原文。共享观察器固定采用该像素预处理，保存原图、OCR 输入图及识别文本，不替换字符或放宽匹配。观察环境因此需要 ImageMagick 的 magick 命令。

### 大量输出的实际停滞

reports/0d432012f543414084fcaf5636517356：18,000 行负载已开始，desktop 长期停在第 16,886 行、cursor 1,841,119，mobile 停在 cursor 337,573；超过一分钟未收到结束 marker。desktop 已接收/已应用/已呈现 cursor 相同，renderReady=true、hold 不可见、resize ACK/fence/settle 均清空，最后一轮 ACK 有发送记录。该失败早于断网，并非原始 hold 卡住的复现。继续记录真实 WebSocket turn-complete/ACK/pong 及最后输出以定位，保留原输出完成断言。

reports/26bde524313646adaa33cb1f6309d56c：另一轮前置失败不是 OCR；截图与原始接收尾部表明立即 insertText + Enter 时，空回车先执行、文字随后到达，停在未提交命令行。网络恢复场景的准备操作改为真实逐键输入后回车（每键 5ms），避免把批量文本提交与回车的独立竞态混入历史准备；当时该输入竞态仍未修复，不能据此宣称瞬时粘贴加回车已验证。01 的待发送输入顺序断言保持原样。

reports/3aed41a10cb4473891ef772a6b75ce92 的逐键输入同样出现前缀被后缀越过（截图先显示 END...，之后才出现 printf 前缀），排除仅为 insertText 工具前提的问题。已确认 input_controller 的 ready 快速路径直接发送新 data，没有先排空 resize/replay 期间的 pendingInput；ACK 清理与 presentation-ready 之间的间隔可触发。修复先转交旧 pendingInput，并且仅移除被 send 接受的条目，不丢弃失败后的剩余数据。最终 01 真实重连输入顺序回归已通过（reports/b1d5a5fc6cad45288af213f4fd3804f8），不能把先前切换输入方式描述成已解决此缺陷。02 的 20 KiB 大段粘贴检查仍失败（reports/0e0e14bc78d34648aa90e14ff3dc2af0），未完成输入链路的全面验收。

## 当前定位

按用户要求，本模块移入 investigations，不在执行器注册表和 test-all 默认发现范围内。断网后的永久旧帧问题尚未稳定复现；现有通过仅说明这些具体条件下能够恢复，不能宣称原始问题已经完整验证。已真实复现的大量短行输出断流，在父项目 Android 大量输出正式场景中回归。

最终 05 连续大量输出回归通过（reports/460db83ca35a411286522141483db4ac）。父项目 Android 大量短行场景收到全部结果、hold=false，但底部结果被系统键盘遮住，截图断言失败（父项目 reports/77a595a9650d455b9257ecfdb6d1e48a）；保留失败，不据此宣称永久旧帧已修复。PC 长离线记录包括实际离线约 21.1 秒、重放 2,027,897 字节的恢复观察（父项目 reports/1e4685b21c10423c89b51ab06339c019），只能说明该轮条件下恢复。
