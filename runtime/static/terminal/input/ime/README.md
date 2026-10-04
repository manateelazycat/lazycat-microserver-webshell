# IME、helper textarea 与 iOS 宿主

## 职责与边界

本目录负责 Ghostty helper textarea、IME composition/preedit、Android 连续删除、移动键盘 focus/blur、同步双击手势、paste/beforeinput 文本去重和终端 host 输入隔离。iOS 经典脚本负责 Lazycat 宿主关闭按钮桥接。

本目录不拥有普通/generated 输入队列、WebSocket、history、resize epoch、Canvas presentation、附件上传或原生 paste 的文件/文本业务分流。textarea paste 事件通过注入命令同步转交 `app/paste`，本目录只用返回的文本结果维护 `beforeinput` 去重。visualViewport、键盘 inset 与方向恢复由调用方注入。

## 入口、状态与生命周期

应用层只能从 `terminal/input/index.js` 导入 `createTerminalIMEController()`、lifecycle 和纯模型；`terminal/input/ime/index.js` 只作为 input 模块内部的子域入口。controller 是 composition、textarea、主动聚焦、native delete、paste 去重和 touch claim 的唯一 owner；lifecycle 独占 session listener、RAF 和 timer，并在 pane close/dispose 后拒绝迟到 callback。`installSession()` 幂等，pane close 和页面 dispose 后不接受迟到输入。

移动端双击由本 controller 按事件时间戳统一识别，保留 320ms、8px 和 16px 的既有阈值，不增加单次按住时长的键盘门槛。选择逻辑认领的长按、滚动、多指和取消手势会清理本组点击历史。有效请求同步聚焦当前已挂载 textarea，不再经过 600ms 聚焦许可；system 恢复仍不得替后台终端取得焦点。

资源创建阶段禁止 Ghostty 初始化抢焦，host 不再作为可编辑或可聚焦节点。IME 保留 Ghostty 的滚动收尾，去掉触摸单击自行聚焦。单击收起由 IME 处理，真正失焦才通知 viewport 恢复；新请求取消旧恢复、惯性及选择/TUI 的待处理触摸任务。

移动触摸布局使用 terminal-input-mobile CSS 固定 textarea 在宿主顶部，宽度随宿主、输入行高和字体固定 16px，不依赖 WASM 光标或安装时尚未挂载的 DOM 测量。聚焦前后使用同一位置，不安排后续帧移动；输出及 resize 的 positionInput 调用在非 composition 时不读取布局、不改写 textarea 样式、值或选区，composition 时只更新独立预览。桌面仍使用光标定位。移动端 source=output 的宿主复位直接跳过，实际 input/scroll 等事件仍由宿主保护处理。`isKeyboardClaimed(event)` 只表示本次 touchend 已被双击键盘认领。`shouldPreserveTouchDefault(event)` 覆盖双击认领和第一下页面焦点交接；selection、TUI、mouse 取消默认行为前必须读取它。`shouldPreserveInputFocus(session)` 仅用于快捷栏维持输入，不代表系统键盘已显示。

Android 默认依赖同步 focus；VirtualKeyboard.show 仅在已有 manual policy 且能力可用时调用，不强制改变浏览器策略，也不把其无返回值当作键盘已经显示。

诊断模块 `keyboard_diagnostics.js` 在触摸设备记录 `[键盘诊断 kbd-v4-stable-input-…]`：初始化、document 与 pane 触摸及兼容鼠标事件、双击判定、focus/blur 和延迟视口快照。通过注入的日志入口使用 `retainWhenDisabled`，即使错误日志窗口未打开也保留记录，可在日志窗口复制。同步路径只收集状态，布局测量在后续 timer 中执行，事件每 400ms 批量写入（每批最多 100 条，溢出计数），遵守错误日志的 200 条批次保留上限。页面销毁清理监听器及定时器。不会采集输入值、终端输出或选区文本；DOM focus 不代表原生键盘已经显示。

焦点交接仅在 document 未聚焦、未识别为双击、无滚动且事件尚未取消时，尝试保留单次轻触的默认行为；Ghostty 包装器只结束滚动状态，不取消该 touchend。shell 捕获对应的兼容 mousedown/mouseup/click，只 stopImmediatePropagation，不 preventDefault，避免 Ghostty 单击聚焦或重复鼠标输入，同时允许浏览器默认聚焦。匹配限于同终端、16px 内、1000ms 内的可信左键事件，排除明确的物理鼠标来源，并在物理鼠标 pointerdown 或匹配 click 后清理；该窗口仅用于兼容鼠标事件匹配，不是键盘许可。诊断事件包括 tap.page-default-offered/host/mouse 和 tap.preserve-default-queried。Grok 延迟点击和 fullscreen TUI 必须尊重 `shouldPreserveTouchDefault(event)`，不得取消 IME 已放行的第一下页面焦点交接。

移动 textarea 与输出、光标布局及 viewport pan 隔离；原生候选窗使用固定输入框锚点，独立 composition 预览按终端字体和光标绘制。

`ios_terminal_host.js` 仍是 HTML 在 ES module 前加载的经典脚本，不通过 `index.js` 导入。

## 文件与验证

- `index.js`：ES module 单一公开入口。
- `ime_controller.js`：composition、textarea、focus、手势与 host 输入编排。
- `ime_lifecycle.js`：session listener、timer、RAF 和幂等清理。
- `ime_model.js`：平台识别、sentinel、delete input type 与 composition 候选纯函数。
- `keyboard_diagnostics.js`：触摸、焦点和视口诊断，管理有界日志及监听器清理。
- `ios_terminal_host.js`：iOS 宿主兼容经典脚本。

从项目根目录运行 `./run-ac.sh --help` 查看场景执行入口。剪贴板场景位于 `spec-tests/app/paste/`，设备与环境配置由 `spec-tests/` 管理。
