const DEFAULT_LOCALE = "zh-CN";
const SUPPORTED_LOCALES = ["zh-CN", "en-US"];
const MESSAGES = {
  "zh-CN": {},
  "en-US": {
    "终端总览": "Terminal Overview",
    "文件管理": "File Management",
    "终端": "Terminal",
    "新建标签": "New Tab",
    "切换到传统PC端布局": "Use Traditional PC Layout",
    "默认关闭；开启后恢复原PC顶部栏和标签布局": "Disabled by default; restore the original PC top bar and tabs when enabled",
    "实例和终端会话": "Instances and terminal sessions",
    "收起侧栏": "Collapse sidebar",
    "展开侧栏": "Expand sidebar",
    "收起实例": "Collapse instance",
    "新建终端会话": "New terminal session",
    "重命名会话": "Rename session",
    "关闭会话": "Close session",
    "关闭其他会话": "Close other sessions",
    "移动窗格到新会话": "Move pane to new session",
    "暂无终端会话": "No terminal sessions",
    "正在加载会话…": "Loading sessions…",
    "会话加载失败，点击重试": "Could not load sessions. Click to retry",
    "会话加载超时，点击重试": "Session loading timed out. Click to retry",
    "会话数据无效，点击重试": "Invalid session data. Click to retry",
    "终端服务需更新，请打开实例后更新": "Open the instance to update its terminal service",
    "实例已停止": "Instance stopped",
    "暂无可访问的实例": "No accessible instances",
    "该会话已关闭": "This session has been closed",
    "无法读取实例会话，请先打开该实例": "Could not load sessions. Open the instance first",
    "切换实例": "Switch Instance",
    "终端管理": "Terminal Management",
    "首页": "Home",
    "返回 LightOS 首页": "Back to LightOS Home",
    "设置": "Settings",
    "打开应用设置": "Open App Settings",
    "客户端设置": "Client Settings",
    "打开客户端设置": "Open Client Settings",
    "检测到终端服务协议待更新，点击查看详情": "Terminal service protocol update detected; click to view details.",
    "更新终端服务协议": "Update Terminal Service Protocol",
    "将更新并重启当前终端服务。当前所有终端会话及正在运行的任务会被中断。确认继续吗？": "This will update and restart the current terminal service. All terminal sessions and running tasks will be interrupted. Continue?",
    "确认更新": "Confirm Update",
    "正在更新终端服务协议...": "Updating terminal service protocol...",
    "终端服务协议已更新，1 秒后重新连接。": "Terminal service protocol updated; reconnecting in 1 second.",
    "终端服务协议更新失败": "Terminal service protocol update failed",
    "搜索终端": "Search terminal",
    "上一个结果": "Previous result",
    "下一个结果": "Next result",
    "关闭搜索": "Close search",
    "新建终端": "New terminal",
    "初始化性能": "Initialization Performance",
    "采集中": "Collecting",
    "复制": "Copy",
    "复制初始化性能数据": "Copy initialization performance data",
    "页面打开到终端渲染": "Page load to terminal rendering",
    "性能监视器": "Performance Monitor",
    "网络监视器": "Network Monitor",
    "流量消费统计": "Traffic Consumption",
    "历史回放消费校准": "History Replay Consumption Calibration",
    "未完整采集本次快照回放": "This checkpoint replay was not fully captured",
    "压缩快照载荷＋原始增量，不含 Base64/JSON 封装": "Compressed checkpoint payload plus raw delta, excluding Base64/JSON framing",
    "原始历史回放载荷": "Raw history replay payload",
    "复制流量消费统计": "Copy traffic consumption data",
    "模块": "Module",
    "接收": "Received",
    "发送": "Sent",
    "当前流量": "Current traffic",
    "已使用流量": "Used traffic",
    "调试日志": "Debug Log",
    "复制全部调试日志": "Copy all debug logs",
    "清空调试日志": "Clear debug logs",
    "清空": "Clear",
    "未启用": "Disabled",
    "切换主题": "Switch theme",
    "关闭": "Close",
    "返回": "Back",
    "终端设置": "Terminal",
    "主题设置": "Theme",
    "手机快捷键设置": "Mobile Shortcuts",
    "PC快捷键设置": "PC Shortcuts",
    "服务转发设置": "Service Forwarding",
    "字体": "Font",
    "显示": "Display",
    "滚动历史": "Scrollback",
    "鼠标": "Mouse",
    "快捷键栏": "Shortcut Bar",
    "重启恢复": "Restart Recovery",
    "重启后恢复标签和会话": "Restore tabs and sessions after restart",
    "默认关闭；开启后按原标签、分屏和工作目录创建新会话，不恢复终端历史": "Disabled by default; when enabled, new sessions are created with the previous tabs, splits, and working directories, without restoring terminal history.",
    "物理机接入说明": "Physical Machine Access Guide",
    "删除": "Delete",
    "编辑字体": "Edit Font",
    "上传字体": "Upload Font",
    "容器实例": "Container Instances",
    "接收 0.000 MB/s · 发送 0.000 MB/s": "Receive 0.000 MB/s · Send 0.000 MB/s",
    "接收 0.000 MB · 发送 0.000 MB": "Receive 0.000 MB · Send 0.000 MB",
    "粘贴": "Paste",
    "全选": "Select All",
    "搜索": "Search",
    "截取长图": "Capture Long Screenshot",
    "打开链接": "Open Link",
    "复制链接": "Copy Link",
    "重命名标签": "Rename Tab",
    "移到最前": "Move Tab to First",
    "左移标签": "Move Tab Left",
    "右移标签": "Move Tab Right",
    "移到最后": "Move Tab to Last",
    "关闭其他标签": "Close Other Tabs",
    "左右分屏": "Split Horizontally",
    "上下分屏": "Split Vertically",
    "移动窗格到新标签": "Move Pane to New Tab",
    "关闭窗格": "Close Pane",
    "关闭标签": "Close Tab",
    "终端主题": "Terminal Theme",
    "关闭设置": "Close Settings",
    "设置分类": "Settings Category",
    "终端字体": "Terminal Font",
    "光标样式": "Cursor Style",
    "块状": "Block",
    "竖线": "Bar",
    "下划线": "Underline",
    "平滑光标": "Smooth Cursor",
    "短距离移动时平滑过渡；系统开启“减少动态效果”时仍会停用动画": "Animate short cursor movements. Animation stays disabled when Reduce Motion is enabled in your system settings.",
    "字体大小": "Font Size",
    "范围 10–32px，默认 16px，修改后立即生效。": "Range: 10–32px. Default: 16px. Changes take effect immediately.",
    "增加字号": "Increase Font Size",
    "减少字号": "Decrease Font Size",
    "恢复默认字号": "Restore Default Font Size",
    "光标样式保存失败。": "Could not save the cursor style.",
    "滚动历史行数": "Scrollback Lines",
    "行间距必须是 {min}-{max}% 之间的整数。": "Line height must be an integer between {min}% and {max}%.",
    "字号必须是 {min}-{max} 之间的整数。": "Font size must be an integer between {min} and {max}.",
    "字号设置无效。": "Invalid font size.",
    "滚动历史行数必须是 {min}-{max} 之间的整数。": "Scrollback lines must be an integer between {min} and {max}.",
    "行间距": "Line Height",
    "按百分比调整终端行高，100% 为默认，增大后同屏显示行数会减少。": "Adjust terminal line height by percent; 100% is default. Increasing it reduces the number of lines visible per screen.",
    "增加行间距": "Increase Line Height",
    "减少行间距": "Decrease Line Height",
    "恢复默认行间距": "Restore Default Line Height",
    "恢复默认": "Reset to Default",
    "历史行数": "History Lines",
    "行数越大，新开或刷新终端时回放越慢；每 1000 行约 0.35MB，5000 行约 1.75MB，修改后刷新或新建终端生效。": "More lines mean slower replay when opening or refreshing terminals; about 0.35MB per 1000 lines, 1.75MB for 5000 lines. Changes take effect after refresh or creating a new terminal.",
    "增加滚动历史": "Increase Scrollback",
    "减少滚动历史": "Decrease Scrollback",
    "恢复默认滚动历史": "Restore Default Scrollback",
    "像素级滚动": "Pixel-Level Scrolling",
    "仅移动端可用，滚动时按像素平滑移动终端内容": "Available on mobile only; scroll terminal content by pixels for smoother movement.",
    "手机端输入": "Mobile Input",
    "启用预输入框": "Enable Draft Input",
    "默认关闭；在手机快捷键栏下方编辑文字和附件，点击发送后一起输入终端": "Disabled by default; compose text and attachments below the mobile shortcuts, then send them to the terminal together.",
    "终端预输入": "Terminal Draft Input",
    "待发送附件": "Pending Attachments",
    "添加附件": "Add Attachments",
    "输入文字，发送到终端": "Compose text for the terminal",
    "发送到终端": "Send to Terminal",
    "相册": "Photos",
    "文件": "Files",
    "移除附件": "Remove Attachment",
    "正在上传": "Uploading",
    "预输入框设置保存失败。": "Draft input settings could not be saved.",
    "发送已暂停，返回原终端后可重试。": "Sending paused. Return to the original terminal to retry.",
    "终端已关闭，发送已停止。": "The terminal was closed. Sending stopped.",
    "终端已切换，草稿未发送。": "The terminal changed. Your draft was not sent.",
    "上传未返回有效文件路径，请重试。": "The upload did not return a valid path. Please retry.",
    "终端暂时无法接收，请重试。": "The terminal cannot accept input right now. Please retry.",
    "发送失败，请重试。": "Sending failed. Please retry.",
    "发送已取消。": "Sending cancelled.",
    "一次最多选择 32 个附件。": "Select up to 32 attachments at a time.",
    "请选择有效的附件。": "Select valid attachments.",
    "文件超过 2GB": "File exceeds 2GB",
    "双击屏幕提醒": "Double-Tap Reminder",
    "熟悉手机双击进入编辑的操作后,可以关闭这个选项": "After getting used to double-tap to enter edit mode, you can disable this option.",
    "鼠标选中复制、中键粘贴": "Select with left click to copy, paste with middle click",
    "桌面端左键选中后自动复制，中键粘贴剪贴板内容": "On desktop, left selection auto-copies and middle click pastes clipboard contents",
    "在PC中开启底部快捷键栏": "Enable bottom shortcut bar on PC",
    "默认关闭；开启后始终显示终端快捷键栏": "Disabled by default; when enabled, the terminal shortcut bar is always visible.",
    "在懒猫微服 PC 客户端中启用「接入 LightOS」后，这台物理机将作为物理机实例接入 LightOS，并允许你从 LightOS 访问其终端和相关资源。": "After enabling \"Access LightOS\" in the Lazycat Microserver PC client, this machine becomes a client instance for LightOS, allowing terminal and related resource access from LightOS.",
    "多屏输出说明": "Multi-Screen Output Notes",
    "PTY 是内核输出，内核无法同时输出不同分辨率的 Shell 结果，所以多设备同时用时，PTY 的输出分辨率会按照正在交互的设备的分辨率输出，其他没有交互的设备分辨率会发生变化，这个不是 bug，是技术限制。当你切换到不同终端时，WebShell 会自动用当前交互设备的分辨率重新布局终端界面。": "PTY output comes from the kernel and cannot render different-resolution shells simultaneously; when multiple devices interact at once, output resolution follows the active device, so non-active device resolution may change. This is a technical limitation. When you switch terminals, WebShell reflows the terminal using the current active device resolution.",
    "调试模式": "Debug Mode",
    "自动刷新屏幕": "Automatic Screen Refresh",
    "字节io": "Byte IO",
    "终端渲染异常捕获": "Terminal Rendering Diagnostics",
    "捕获当前状态": "Capture Current State",
    "记录当前标签所有分屏的渲染状态，默认关闭": "Capture rendering state for every pane in the current tab. Disabled by default.",
    "终端渲染异常捕获日志已复制。": "Terminal rendering diagnostics copied.",
    "复制终端渲染异常捕获日志失败。": "Failed to copy terminal rendering diagnostics.",
    "字节io日志": "Byte IO Log",
    "复制所有日志": "Copy All Logs",
    "下载": "Download",
    "下载终端渲染异常捕获日志": "Download terminal rendering diagnostics",
    "下载字节io日志": "Download byte IO logs",
    "下载初始化性能日志": "Download initialization performance logs",
    "下载流量消费日志": "Download traffic consumption logs",
    "下载全部调试日志": "Download all debug logs",
    "暂无可下载的日志。": "No logs available to download.",
    "下载日志失败。": "Failed to download logs.",
    "记录接收、排队、解析和绘制耗时，默认关闭": "Log receive, queue, parse and render timings. Disabled by default.",
    "字节io日志已复制。": "Byte IO logs copied.",
    "复制字节io日志失败。": "Failed to copy byte IO logs.",
    "默认开启，检查可见终端并按需补绘；独立于调试模式": "Enabled by default. Checks visible terminals and repaints when needed, independently of debug mode.",
    "关闭时停止调试工具": "Debug tools stop when turned off",
    "在线设备": "Online Devices",
    "查看当前正在连接的设备": "View devices currently connected",
    "设备心跳": "Device Heartbeat",
    "定期上报当前设备在线状态，默认关闭": "Periodic online status reporting for current device, disabled by default",
    "FPS监视器": "FPS Monitor",
    "在终端右上角显示实时 FPS 和刷新率": "Show live FPS and refresh rate in the terminal top-right",
    "采集并显示前端任务耗时": "Collect and show front-end task duration",
    "初始化性能指标": "Initialization Performance Metrics",
    "首次加载终端时显示初始化事件耗时，完成后停止采样，默认关闭": "Show initialization event cost when first loading terminal, stop sampling when complete, disabled by default",
    "错误日志": "Error Log",
    "在终端右上角记录连接、网络和错误状态，默认关闭": "Record connection, network, and error states in the terminal top-right, disabled by default",
    "在顶部栏显示终端会话流量，默认关闭": "Show terminal session traffic in the top bar, disabled by default",
    "按任务拆分网络监视器统计的流量，需先开启网络监视器": "Break down network monitor traffic by task; requires Network Monitor",
    "在每个会话右上角对比当前回放消费与服务端真实历史大小，需先开启网络监视器": "Compare current replay consumption with actual server history in each session; requires Network Monitor",
    "允许移动端启用远程桌面": "Enable Remote Desktop on Mobile",
    "允许在 LightOS 移动端首页显示远程桌面入口，默认关闭": "Show remote desktop entry on LightOS mobile home page, disabled by default",
    "强制 PC 模式": "Force PC Mode",
    "在移动设备上使用 PC 端布局和交互，默认关闭": "Use PC layout and interactions on mobile devices, disabled by default",
    "手机快捷键": "Mobile Shortcuts",
    "新增快捷键": "Add Shortcut",
    "恢复默认手机快捷键": "Restore Default Mobile Shortcuts",
    "手机快捷键列表": "Mobile Shortcut List",
    "PC快捷键": "PC Shortcuts",
    "恢复默认PC快捷键": "Restore Default PC Shortcuts",
    "PC快捷键列表": "PC Shortcut List",
    "服务转发": "Service Forwarding",
    "添加服务": "Add Service",
    "服务转发列表": "Service Forwarding List",
    "关闭在线设备": "Close Online Devices",
    "当前正在连接的设备": "Currently Connected Devices",
    "上游地址": "Upstream Address",
    "协议": "Protocol",
    "端口": "Port",
    "增加端口": "Increase Port",
    "减少端口": "Decrease Port",
    "路径或查询参数": "Path or Query Parameters",
    "/ 或 /base?x=1": "/ or /base?x=1",
    "显示名称": "Display Name",
    "服务名称": "Service Name",
    "子域名": "Subdomain",
    "图标": "Icon",
    "不使用账号保护": "No account protection",
    "允许未登录 Lazycat Microserver 账号时访问该服务": "Allow accessing this service without logging in to Lazycat Microserver account",
    "取消": "Cancel",
    "部署服务": "Deploy Service",
    "编辑快捷键": "Edit Shortcut",
    "名称": "Name",
    "类型": "Type",
    "发送按键": "Send Key",
    "执行动作": "Execute Action",
    "发送文字": "Send Text",
    "按键": "Key",
    "字符": "Character",
    "修饰键": "Modifier Keys",
    "动作": "Action",
    "文字": "Text",
    "保存": "Save",
    "快捷键": "Shortcut",
    "点击后按下组合键": "Press the key combination after clicking",
    "点击切换排序": "Click to change sorting",
    "终端标签": "Terminal Tabs",
    "上传粘贴板内容": "Upload Clipboard Content",
    "上传文件": "Upload Files",
    "下载文件": "Download Files",
    "隐藏文件管理": "Hide File Manager",
    "路径导航": "Path Navigation",
    "文件列表排序": "File List Sort",
    "按名称排序": "Sort by Name",
    "按文件大小排序": "Sort by File Size",
    "文件大小": "File Size",
    "按修改日期排序": "Sort by Modified Date",
    "修改日期": "Modified Date",
    "刚刚": "Just now",
    "文件列表": "File List",
    "下载选中": "Download Selected",
    "终端快捷键": "Terminal Shortcuts",
    "终端快捷键第一行": "Terminal Shortcuts Row 1",
    "终端快捷键第二行": "Terminal Shortcuts Row 2",
    "关闭菜单": "Close Menu",
    "终端菜单": "Terminal Menu",
    "终端菜单操作": "Terminal Menu Actions",
    "取消关闭": "Cancel Close",
    "关闭标签？": "Close tab?",
    "无预览": "No preview",
    "暂无终端": "No terminals",
    "当前": "Current",
    "当前使用": "In use",
    "切换到": "Switch to",
    "全屏": "Fullscreen",
    "最后一个标签": "Last Tab",
    "标签移到最前": "Move Tab to First",
    "标签左移": "Move Tab Left",
    "标签右移": "Move Tab Right",
    "标签移到最后": "Move Tab to Last",
    "选择上方窗格": "Select Pane Above",
    "选择下方窗格": "Select Pane Below",
    "选择左侧窗格": "Select Pane Left",
    "选择右侧窗格": "Select Pane Right",
    "复制终端文本": "Copy Terminal Text",
    "粘贴到终端": "Paste to Terminal",
    "全选终端缓冲区": "Select All Terminal Buffer",
    "从剪贴板导入附件": "Import Attachment from Clipboard",
    "附件": "Attachment",
    "上传附件文件": "Upload Attachment File",
    "普通字符": "Regular character",
    "方向键 ↑": "Arrow Up",
    "方向键 ↓": "Arrow Down",
    "方向键 ←": "Arrow Left",
    "方向键 →": "Arrow Right",
    "Ctrl 粘滞键": "Sticky Ctrl",
    "Alt 粘滞键": "Sticky Alt",
    "Shift 粘滞键": "Sticky Shift",
    "切换最近两个终端": "Switch Between Recent Terminals",
    "下一个标签": "Next Tab",
    "上一个标签": "Previous Tab",
    "放大": "Zoom In",
    "缩小": "Zoom Out",
    "菜单": "Menu",
    "触感开关": "Haptic Feedback",
    "编辑": "Edit",
    "暂无快捷键": "No shortcuts",
    "系统默认": "System Default",
    "内置终端字体": "Built-in terminal font",
    "预装字体": "Preinstalled font",
    "拖拽排序": "Drag to reorder",
    "第二行": "Second row",
    "完成编辑": "Finish Editing",
    "完成": "Done",
    "返回设置列表": "Back to Settings List",
    "编辑PC快捷键": "Edit PC Shortcut",
    "新增PC快捷键": "Add PC Shortcut",
    "快捷键名称必须是 1-16 个字符。": "Shortcut name must be 1–16 characters.",
    "快捷键名称必须是 1-32 个字符。": "Shortcut name must be 1–32 characters.",
    "手机快捷键最多 64 个。": "You can have at most 64 mobile shortcuts.",
    "PC快捷键最多 64 个。": "You can have at most 64 PC shortcuts.",
    "请选择有效动作。": "Select a valid action.",
    "发送文字必须是 1-1024 个字符。": "Text must be 1–1024 characters.",
    "发送文字不能包含 NUL 字符。": "Text cannot contain NUL characters.",
    "请输入或选择按键。": "Enter or select a key.",
    "请输入有效快捷键。": "Enter a valid shortcut.",
    "该快捷键已经被其他动作使用。": "This shortcut is already used by another action.",
    "字体删除失败": "Font deletion failed",
    "设置加载失败": "Settings loading failed",
    "设置保存失败": "Settings save failed",
    "字体上传失败": "Font upload failed",
    "未知字体": "Unknown font",
    "Nerd Font 符号字体加载失败，starship prompt 可能显示异常。": "The Nerd Font symbol font failed to load; the starship prompt may render incorrectly.",
    "部分字体加载失败：": "Some fonts failed to load: ",
    "行间距设置无效。": "Line-height settings are invalid.",
    "行间距设置保存失败。": "Line-height settings could not be saved.",
    "滚动历史设置无效。": "Scrollback settings are invalid.",
    "滚动历史设置保存失败。": "Scrollback settings could not be saved.",
    "滚动历史设置已保存，刷新或新建终端后生效。": "Scrollback settings saved; refresh or create a terminal for them to take effect.",
    "手机快捷键保存失败。": "Mobile shortcuts could not be saved.",
    "快捷键设置无效。": "Shortcut settings are invalid.",
    "PC快捷键保存失败。": "PC shortcuts could not be saved.",
    "PC快捷键设置无效。": "PC shortcut settings are invalid.",
    "删除快捷键": "Delete Shortcut",
    "删除快捷键失败。": "Shortcut deletion failed.",
    "字体上传失败。": "Font upload failed.",
    "字体设置保存失败。": "Font settings could not be saved.",
    "字体删除失败。": "Font deletion failed.",
    "批量删除字体": "Delete Fonts",
    "无法打开客户端设置": "Unable to open client settings",
    "滚动历史已恢复默认，刷新或新建终端后生效。": "Scrollback reset to default; refresh or create a terminal for it to take effect.",
    "鼠标复制粘贴设置保存失败。": "Mouse copy/paste settings could not be saved.",
    "PC底部快捷键栏设置保存失败。": "PC shortcut bar settings could not be saved.",
    "像素级滚动设置保存失败。": "Pixel scrolling settings could not be saved.",
    "双击屏幕提醒设置保存失败。": "Double-tap reminder settings could not be saved.",
    "恢复默认手机快捷键？当前自定义配置会被替换。": "Restore default mobile shortcuts? Your custom configuration will be replaced.",
    "恢复默认PC快捷键？当前自定义配置会被替换。": "Restore default PC shortcuts? Your custom configuration will be replaced.",
    "手机快捷键恢复默认失败。": "Restoring default mobile shortcuts failed.",
    "PC快捷键恢复默认失败。": "Restoring default PC shortcuts failed.",
    "PC快捷键删除失败。": "PC shortcut deletion failed.",
    "字号": "Font size",
    "发送文字: ": "Send text: ",
    "第 ": "No. ",
    " 个标签": " tab",
    "删除选中的 ": "Delete selected ",
    " 个字体？": " fonts?",
    "删除当前字体后终端将恢复系统默认字体。": "The terminal will use the system default font after deleting the current font.",
    "删除选中的": "Delete selected",
    "字体？": "font?",
    "编辑服务": "Edit Service",
    "当前没有可用容器。": "No container is available.",
    "暂无服务转发。": "No service forwarding entries.",
    "未命名服务": "Unnamed service",
    "未设置上游地址": "Upstream address not set",
    "已部署：": "Deployed: ",
    "未安装应用入口": "App entry not installed",
    "打开": "Open",
    "已部署": "Deployed",
    "服务删除失败": "Service deletion failed",
    "服务部署失败。": "Service deployment failed.",
    "服务转发列表刷新失败。": "Service forwarding list refresh failed.",
    "服务转发列表加载失败。": "Service forwarding list loading failed.",
    "服务转发创建失败。": "Service forwarding creation failed.",
    "服务转发删除失败。": "Service forwarding deletion failed.",
    "服务转发更新失败。": "Service forwarding update failed.",
    "服务转发状态加载失败。": "Service forwarding status loading failed.",
    "当前环境不支持网络请求。": "The current environment does not support network requests.",
    "当前环境不支持服务部署。": "The current environment does not support service deployment.",
    "请选择有效协议。": "Select a valid protocol.",
    "请输入上游主机。": "Enter an upstream host.",
    "请输入 1-65535 之间的端口。": "Enter a port between 1 and 65535.",
    "路径或查询参数不能包含 #。": "The path or query parameters cannot contain #.",
    "上游地址不是有效的 HTTP/HTTPS URL。": "The upstream address is not a valid HTTP/HTTPS URL.",
    "请输入显示名称。": "Enter a display name.",
    "子域名只能包含小写字母、数字和连字符，且必须以字母或数字开头。": "The subdomain may contain only lowercase letters, numbers, and hyphens, and must start with a letter or number.",
    "图标必须是 PNG 图片。": "The icon must be a PNG image.",
    "无效": "Invalid",
    "WebShell 启动失败": "WebShell failed to start",
    "检测到后台进程": "Background process detected",
    "确认": "Confirm",
    "确认操作？": "Confirm this action?",
    "选择": "Select",
    "网络已恢复，正在重连。": "Network restored; reconnecting.",
    "网络已断开。": "Network disconnected.",
    "WebShell 已更新": "WebShell updated",
    "检测到 WebShell 服务已更新，请重新加载页面以使用最新版本。": "The WebShell service was updated. Reload the page to use the latest version.",
    "版本检查失败": "Version check failed",
    "重启提示失败": "Restart prompt failed",
    "重新加载": "Reload",
    "使用": "Using",
    "主题": " theme",
    "上传失败": "Upload failed",
    "剪贴板没有可导入的内容。": "There is no importable content in the clipboard.",
    "剪贴板读取失败。": "Clipboard read failed.",
    "当前页面策略禁止主动读取剪贴板，请使用 Ctrl+V 或 Command+V 粘贴。": "Clipboard access is blocked by this page's policy. Paste with Ctrl+V or Command+V.",
    "请选择要上传的文件。": "Select a file to upload.",
    "松开后上传": "Release to upload",
    "个文件": "files",
    "暂不支持拖入文件夹。": "Folders cannot be uploaded yet.",
    "附件上传失败。": "Attachment upload failed.",
    "上传成功。": "Upload succeeded.",
    "上传成功，文件路径已就绪。": "Upload succeeded; the file path is ready.",
    "准备上传": "Preparing upload",
    "这个目录没有文件": "This directory has no files",
    "升序": "Ascending",
    "降序": "Descending",
    "设备 API 不可用": "Device API unavailable",
    "设备列表加载失败": "Device list loading failed",
    "设备列表加载失败。": "Device list loading failed.",
    "暂无正在连接的设备": "No connected devices",
    "正在加载设备...": "Loading devices...",
    "未处理的异步错误": "Unhandled asynchronous error",
    "资源加载失败": "Resource loading failed",
    "页面运行错误": "Page runtime error",
    "任务": "Task",
    "初始化事件": "Initialization event",
    "平均": "Average",
    "总耗时: ": "Total time: ",
    "总计": "Total",
    "时间线:": "Timeline:",
    "暂无采样": "No samples",
    "最大": "Maximum",
    "次数": "Count",
    "正在重试": "Retrying",
    "状态: ": "Status: ",
    "直连通道": "Direct channel ",
    "累计 ": "Elapsed ",
    "网络异常": "Network error",
    "网络正常": "Network normal",
    "连接中": "Connecting",
    "错误": "Error",
    "页面初始化": "Page initialization",
    "Ghostty 就绪": "Ghostty ready",
    "主题就绪": "Theme ready",
    "历史回放开始": "History replay started",
    "回放输出排空": "Replay output drained",
    "完整渲染开始": "Full render started",
    "完整渲染请求": "Full render requested",
    "实例列表就绪": "Instance list ready",
    "工作区数据就绪": "Workspace data ready",
    "工作区请求开始": "Workspace request started",
    "服务端逻辑 attach 开始": "Server-side attach started",
    "渲染被阻塞": "Rendering blocked",
    "物理 WebSocket": "Physical WebSocket",
    "物理 WebSocket 创建开始": "Physical WebSocket creation started",
    "物理通道": "Physical channel",
    "物理通道服务端已就绪": "Physical channel server ready",
    "等待首个初始化事件": "Waiting for the first initialization event",
    "诊断模块启动": "Diagnostics module started",
    "逻辑层 socket": "Logical socket",
    "逻辑层 socket 会话开始": "Logical socket session started",
    "逻辑层 socket 连接开始": "Logical socket connection started",
    "逻辑层订阅": "Logical subscription",
    "逻辑层订阅已发送": "Logical subscription sent",
    "页面开始": "Page started",
    "统一通道": "Unified channel",
    "运行时事件": "Runtime event",
    "请求失败": "Request failed",
    "恢复": "Restore",
    "总览": "Overview",
    "双击屏幕开启键盘输入": "Double-tap the screen to open keyboard input",
    "操作失败。": "Operation failed.",
    "标签排序失败。": "Tab reordering failed.",
    "截图失败。": "Screenshot failed.",
    "截图画布不可用。": "Screenshot canvas unavailable.",
    "截图编码失败。": "Screenshot encoding failed.",
    "继续": "Continue",
    "待发送输入过大，已拒绝继续排队。": "Pending input is too large; further queuing was rejected.",
    "窗格不可用": "Pane unavailable",
    "至少需要保留一个标签。": "At least one tab must remain.",
    "服务端日志": "Server log",
    "PTY replay 开始": "PTY replay started",
    "逻辑层 socket 创建": "Logical socket created",
    "逻辑层 socket 连接流程开始": "Logical socket connection flow started",
    "运行中命令": "Running commands",
    "workspace 请求开始": "Workspace request started",
    "无": "none",
    " 个文件": " files",
    "按": "Sort by ",
    "排序": "sort",
    " · 详情 ": " · Details ",
    "Ghostty WASM 已就绪": "Ghostty WASM ready",
    "未指定": "unspecified",
    "页面模块已启动": "Page modules started",
    "会话=": "Session=",
    "分屏=": "Pane=",
    "正在运行: ": "Running: ",
    "重新创建终端": "Recreate Terminal",
    "正在重新创建终端...": "Recreating terminal...",
    "重新创建终端失败。": "Could not recreate the terminal.",
    "剪贴板没有可粘贴的文本或文件。": "The clipboard contains no text or files to paste.",
    "粘贴失败。": "Paste failed.",
    "快捷键执行失败。": "Could not run the shortcut.",
    "上传已取消": "Upload canceled",
    "文件列表请求不可用。": "File listing is unavailable.",
    "文件列表读取失败 ({status})": "Could not load the file list ({status})",
    "文件列表读取失败。": "Could not load the file list.",
    "当前浏览器无法上传附件。": "This browser cannot upload attachments.",
    "当前页面策略禁止主动读取剪贴板，请使用系统粘贴快捷键。": "Clipboard access is blocked by this page's policy. Use your system paste shortcut.",
    "当前浏览器无法创建附件文件。": "This browser cannot create attachment files.",
    "当前浏览器环境无法读取剪贴板。": "Clipboard reading is unavailable in this browser.",
    "没有可用的当前终端。": "No terminal is currently available.",
    "一次最多下载 {count} 个条目。": "Download up to {count} items at a time.",
    "一次最多上传 {count} 个文件。": "Upload up to {count} files at a time.",
    "当前终端已切换，请重新选择文件。": "The terminal has changed. Select the files again.",
    "路径复制失败。": "Could not copy the path.",
    "文件超过 2GB：{name}": "File exceeds 2GB: {name}",
    "上传成功，点击复制路径。": "Upload succeeded. Click to copy the path.",
    "文件路径已复制到剪切板,粘贴即可": "File path copied to the clipboard. Paste it to continue.",
    "关闭上传提示": "Close Upload Status",
    "设备心跳失败": "Device heartbeat failed",
    "设备列表响应无效": "Invalid device list response",
    "设备心跳超时 ({timeout}ms)": "Device heartbeat timed out ({timeout}ms)",
    "在线设备列表请求失败": "Could not load online devices",
    "当前在线": "Online Now",
    "无法返回首页": "Could not return to the home page",
    "LightOS 首页地址不可用。": "The LightOS home URL is unavailable.",
    "LightOS 首页地址协议无效。": "The LightOS home URL uses an invalid protocol.",
    "无法获取 LightOS 首页地址 ({status})": "Could not retrieve the LightOS home URL ({status})",
    "LightOS 首页地址响应无效: {error}": "Invalid LightOS home URL response: {error}",
    "服务转发创建失败": "Could not create service forwarding",
    "服务转发部署失败 ({status})": "Could not deploy service forwarding ({status})",
    "服务转发列表加载失败": "Could not load service forwarding entries",
    "服务转发删除失败": "Could not delete service forwarding",
    "服务转发状态加载失败": "Could not load service forwarding status",
    "服务转发更新失败": "Could not update service forwarding",
    "服务转发操作已失效。": "This service forwarding operation is no longer valid.",
    "正在加载服务转发...": "Loading service forwarding...",
    "服务转发列表已刷新。": "Service forwarding list refreshed.",
    "当前没有可用实例。": "No instances are currently available.",
    "跳过鉴权会让能够访问发布域名的人直接访问这台物理机可达的目标服务。确定公开吗？": "Skipping authentication lets anyone who can access the published domain use the target service reachable from this machine. Make it public?",
    "公开物理机服务": "Make Machine Service Public",
    "确认公开": "Make Public",
    "无法编辑不属于当前实例的服务。": "Cannot edit a service belonging to another instance.",
    "服务已部署，但 APK 生成失败。": "Service deployed, but APK generation failed.",
    "服务已部署。": "Service deployed.",
    "服务已部署，但列表刷新失败。": "Service deployed, but the list could not be refreshed.",
    "无法删除不属于当前实例的服务。": "Cannot delete a service belonging to another instance.",
    "删除服务「{name}」？": "Delete service “{name}”?",
    "删除快捷键「{name}」？": "Delete shortcut “{name}”?",
    "编辑 {name}": "Edit {name}",
    "发送文字: {text}": "Send text: {text}",
    "切换到第 {count} 个标签": "Switch to tab {count}",
    "第 {count} 个标签": "Tab {count}",
    "删除服务": "Delete Service",
    "服务已删除。": "Service deleted.",
    "主机端口 {port} 已被占用，服务转发暂时不可用。": "Host port {port} is in use. Service forwarding is temporarily unavailable.",
    "目标地址由物理机访问，可填写主机名、局域网或公网 IP": "The target is accessed from this machine. Enter a hostname, LAN IP, or public IP.",
    "选区内容已变化，请重新选择后复制。": "The selection has changed. Select it again before copying.",
    "选区内容过多，请缩小范围后复制。": "The selection is too large. Select less text before copying.",
    "复制未完成，请稍后重试。": "Copying did not complete. Try again shortly.",
    "没有可复制的选区。": "There is no selection to copy.",
    "已复制。": "Copied.",
    "复制失败。": "Copy failed.",
    "链接已复制。": "Link copied.",
    "匹配结果过多，请缩小搜索范围。": "Too many matches. Narrow your search.",
    "搜索未完成，请稍后重试。": "Search did not complete. Try again shortly.",
    "读取选区失败，请重试。": "Could not read the selection. Try again.",
    "没有可搜索的选区。": "There is no selection to search.",
    "粘贴内容过大，已丢弃部分输入。": "The pasted content is too large. Some input was discarded.",
    "终端尚未恢复，待发送输入已达到 256 KiB 上限。": "The terminal has not recovered. Pending input has reached the 256 KiB limit.",
    "当前截图范围过长，请向终端底部滚动后重试。": "The capture range is too long. Scroll toward the bottom of the terminal and try again.",
    "没有可导出的终端内容。": "There is no terminal content to export.",
    "当前终端画面尚未就绪。": "The terminal display is not ready yet.",
    "终端布局已变化，请重试截图。": "The terminal layout has changed. Capture it again.",
    "终端内容已变化，请重试截图。": "The terminal content has changed. Capture it again.",
    "终端历史在截图过程中发生变化，请重试。": "Terminal history changed during capture. Try again.",
    "终端长图正在生成，请稍候。": "A long screenshot is being generated. Please wait.",
    "正在生成终端长图…": "Generating terminal screenshot…",
    "长图已生成，共 {count} 张。现在保存？": "Generated {count} screenshots. Save them now?",
    "长图已生成。现在分享或保存？": "Screenshot ready. Share or save it now?",
    "终端长图": "Terminal Screenshot",
    "截图已打开分享。": "Screenshot opened for sharing.",
    "已取消截图分享。": "Screenshot sharing canceled.",
    "截图下载已开始，共 {count} 张。": "Downloading {count} screenshots.",
    "截图下载已开始。": "Screenshot download started.",
    "截图未完成，请稍后重试。": "Screenshot capture did not complete. Try again shortly.",
    "已选中完整终端缓冲区。": "Entire terminal buffer selected.",
    "请更新 PC 客户端并重新启用 LightOS 接入，当前终端服务不支持统一连接。": "Update the PC client and re-enable LightOS access. The current terminal service does not support unified connections.",
    "关闭此窗格并终止正在运行的命令？": "Close this pane and terminate its running commands?",
    "关闭此标签并终止正在运行的命令？": "Close this tab and terminate its running commands?",
    "关闭其他标签并终止正在运行的命令？": "Close the other tabs and terminate their running commands?",
    "没有可切换的最近终端。": "There is no recent terminal to switch to.",
    "终端服务协议版本不一致，需要确认更新。": "The terminal service protocol version differs. Confirm the update to continue.",
    "终端暂时无法恢复，请刷新页面重试。": "The terminal cannot recover right now. Refresh the page to try again.",
    "网络监视器加载失败": "Could not load the network monitor",
    "暂无可复制的流量消费数据。": "There is no traffic consumption data to copy.",
    "流量消费统计已复制。": "Traffic consumption statistics copied.",
    "复制流量消费统计失败。": "Could not copy traffic consumption statistics.",
    "初始化性能数据已复制。": "Initialization performance data copied.",
    "复制初始化性能数据失败。": "Could not copy initialization performance data.",
    "暂无可复制的调试日志。": "There are no debug logs to copy.",
    "调试日志已复制。": "Debug logs copied.",
    "复制调试日志失败。": "Could not copy debug logs.",
    "已完成": "Completed",
    "等待历史回放": "Waiting for history replay",
    "正在校准历史回放": "Calibrating history replay",
    "历史回放消费正常": "History replay traffic is normal",
    "异常：历史回放消费大于本次应回放字节": "Warning: replay traffic exceeds the expected byte count",
    "异常：历史回放消费不足本次应回放字节的一半": "Warning: replay traffic is less than half the expected byte count",
    "当前历史回放流量消费": "Current history replay traffic",
    "当前会话历史总字节大小": "Total history bytes for this session",
    "本次应回放 {size} MB": "Expected replay: {size} MB",
    "模式 {mode}": "Mode: {mode}",
    "页面标识: {id}": "Page ID: {id}",
    "浏览器: {agent}": "Browser: {agent}",
    "时间基准 Unix ms: {time}": "Time origin (Unix ms): {time}",
    "计时起点 performance.now ms: {time}（运行时启动，不含此前资源加载）": "Timer start (performance.now ms): {time} (runtime startup, excluding earlier resource loading)",
    "终端输出": "Terminal Output",
    "历史回放": "History Replay",
    "实时输出": "Live Output",
    "终端输入": "Terminal Input",
    "用户输入": "User Input",
    "终端自动响应": "Automatic Terminal Response",
    "终端控制": "Terminal Control",
    "尺寸同步": "Size Sync",
    "主题同步": "Theme Sync",
    "终端连接": "Terminal Connection",
    "连接保活": "Connection Keepalive",
    "消费确认": "Consumption Acknowledgment",
    "终端诊断": "Terminal Diagnostics",
    "会话控制": "Session Control",
    "设置就绪": "Settings ready",
    "工作区应用完成": "Workspace applied",
    "逻辑层 socket 已打开": "Logical socket opened",
    "物理 WebSocket 已打开": "Physical WebSocket opened",
    "物理通道服务端 Agent 准备开始": "Server-side agent preparation started",
    "Agent 准备": "Agent preparation",
    "Agent attach 准备完成": "Agent attach ready",
    "首个终端数据": "First terminal data",
    "历史回放接收完成": "History replay received",
    "收到服务端尺寸确认": "Server size acknowledgment received",
    "终端渲染开始": "Terminal rendering started",
    "Presentation 就绪状态": "Presentation readiness",
    "完整渲染完成": "Full render completed",
    "终端渲染完成": "Terminal rendering completed",
    "Worker 已创建": "Worker created",
    "Worker 重建开始": "Worker restart started",
    "Worker 请求发出": "Worker request sent",
    "Worker 请求完成": "Worker request completed",
    "Worker 失败": "Worker failure",
    "本地尺寸事务清理": "Local resize transaction cleanup",
    "本地尺寸更新等待调度": "Local resize waiting for scheduling",
    "连续服务端尺寸等待按序应用": "Server resizes waiting to be applied in order",
    "本地尺寸应用开始": "Local resize application started",
    "本地尺寸应用结果": "Local resize application result",
    "本地尺寸应用取消": "Local resize application canceled",
    "本地尺寸应用失败": "Local resize application failed",
    "收到服务端尺寸拒绝": "Server size rejection received",
    "本地终端尺寸已提交": "Local terminal size submitted",
    "整段历史接收开始": "Full history reception started",
    "整段历史接收完成": "Full history reception completed",
    "整段历史解析完成": "Full history parsing completed",
    "历史按尺寸边界分段解析": "History parsed by resize boundaries",
    "终端进程已退出": "Terminal process exited",
    "真实终端": "Live terminal",
    "终端初始化": "Terminal initialization",
    "等待下一步 · {step}": "Waiting for the next step · {step}",
    "终端服务协议更新完成": "Terminal service protocol update completed",
    "终端服务协议更新确认失败": "Could not confirm the terminal service protocol update",
    "主题加载完成": "Themes loaded",
    "设置加载完成": "Settings loaded",
    "实例列表加载完成": "Instance list loaded",
    "物理通道预连接已发起": "Physical channel preconnection started",
    "与前端初始化并行，pane 就绪后再订阅": "Runs alongside frontend initialization; subscribes when the pane is ready",
    "Ghostty、主题、设置和实例初始化完成": "Ghostty, themes, settings, and instances initialized",
    "应用 bootstrap 完成": "Application bootstrap completed",
    "WebShell 错误终端创建失败": "Could not create the WebShell error terminal",
    "网络已断开，终端暂停重试": "Network disconnected; terminal retries paused",
    "网络已恢复，终端开始重连": "Network restored; terminal reconnecting",
    "版本检查跳过：当前网络离线": "Version check skipped: network offline",
    "错误日志已启用": "Error logging enabled",
    "终端 resize 呈现等待较长": "Terminal resize presentation is taking longer than expected",
    "终端自动恢复已停止": "Automatic terminal recovery stopped",
    "终端处理停滞，正在恢复": "Terminal processing stalled; recovering",
    "终端后台启动失败": "Terminal backend startup failed",
    "终端连接已恢复": "Terminal connection restored",
    "终端历史回放已暂停": "Terminal history replay paused",
    "终端历史回放恢复重试": "Terminal history replay recovery retry",
    "终端待发送输入超过限制": "Pending terminal input exceeds the limit",
    "终端清理失败": "Terminal cleanup failed",
    "终端运行时重置失败，降级清理后继续": "Terminal runtime reset failed; continuing after fallback cleanup",
    "终端运行时清理失败": "Terminal runtime cleanup failed",
    "终端输入已就绪": "Terminal input ready",
    "真实终端 Canvas 已显示": "Live terminal canvas displayed",
    "终端 pane 已创建": "Terminal pane created",
    "终端历史回放等待尺寸": "Terminal history replay waiting for size",
    "终端历史回放重置异常": "Terminal history replay reset error",
    "终端网络错误将自动重试": "Terminal network error; retries are automatic",
    "终端连接建立失败": "Could not establish the terminal connection",
    "终端连接异常，准备重试": "Terminal connection error; preparing to retry",
    "终端连接流程开始": "Terminal connection process started",
    "终端回放身份校验失败": "Terminal replay identity verification failed",
    "终端会话消息身份不匹配": "Terminal session message identity mismatch",
    "终端历史同步失败": "Terminal history sync failed",
    "终端 WebSocket 已打开": "Terminal WebSocket opened",
    "服务端终端解析失败，使用原始历史回放": "Server-side terminal parsing failed; using raw history replay",
    "服务端终端快照异常": "Server-side terminal checkpoint error",
    "PTY replay 完成通知": "PTY replay completion notification",
    "agent 准备中": "Preparing agent",
    "终端 WebSocket 已断开": "Terminal WebSocket disconnected",
    "终端连接已停放": "Terminal connection parked",
    "统一终端 logical stream 将重试": "Unified terminal logical stream will retry",
    "统一终端 logical stream 建立失败": "Could not establish the unified terminal logical stream",
    "终端物理通道异常，正在恢复": "Terminal physical channel error; recovering",
    "终端物理通道恢复失败": "Terminal physical channel recovery failed",
    "统一终端物理通道已断开，立即重建": "Unified terminal physical channel disconnected; rebuilding immediately",
    "统一终端物理通道健康检查失败": "Unified terminal physical channel health check failed",
    "统一终端物理通道 WebSocket 错误，立即关闭重建": "Unified terminal physical channel WebSocket error; closing and rebuilding immediately",
    "统一终端协议错误": "Unified terminal protocol error",
    "物理通道预连接未完成，等待终端正常接入": "Physical channel preconnection incomplete; waiting for normal terminal connection",
    "分屏调整失败": "Could not resize the split panes",
    "workspace 响应完成": "Workspace response completed",
    "workspace 应用完成": "Workspace applied",
    "终端事件 {type}": "Terminal event {type}",
  },
};

// Match complete dynamic UI messages so counts and user-provided names keep
// their values without relying on partial Chinese word replacements.
const MESSAGE_TEMPLATES = Object.entries(MESSAGES["en-US"])
  .filter(([key]) => /\{\w+\}/.test(key))
  .map(([key, translation]) => {
    const names = [];
    const source = key.split(/(\{\w+\})/).map((part) => {
      if (/^\{\w+\}$/.test(part)) {
        names.push(part.slice(1, -1));
        return "([\\s\\S]*?)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    return { pattern: new RegExp(`^${source}$`), names, translation };
  });

const PLACEHOLDER_RE = /\{\{\s*\$t\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1\s*\)\s*\}\}/g;
const TEXT_NODE_SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
const TRANSLATABLE_ATTRIBUTES = new Set(["aria-label", "title", "placeholder"]);
const CHINESE_CHAR_RE = /[\u4e00-\u9fff]/;
const LOCALIZED_TEXT_VALUES = new WeakMap();
const LOCALIZED_ATTRIBUTE_VALUES = new WeakMap();

const localeFallbackChain = {
  "zh": "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-hant": "zh-CN",
  "en": "en-US",
};

const normalizeLocale = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) {
    return "";
  }
  if (localeFallbackChain[normalized]) {
    return localeFallbackChain[normalized];
  }
  const primary = normalized.split("-")[0];
  return localeFallbackChain[primary] || primary;
};

const getBrowserLocale = () => {
  const candidateLocales = [];
  if (typeof navigator !== "undefined" && typeof navigator.languages !== "undefined" && navigator.languages?.length) {
    candidateLocales.push(...navigator.languages);
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    candidateLocales.push(navigator.language);
  }
  if (typeof navigator !== "undefined" && navigator.userLanguage) {
    candidateLocales.push(navigator.userLanguage);
  }
  return candidateLocales.find((candidate) => {
    const locale = normalizeLocale(candidate);
    return SUPPORTED_LOCALES.includes(locale);
  });
};

const resolveLocale = (value) => {
  const locale = normalizeLocale(value || getBrowserLocale() || DEFAULT_LOCALE);
  if (SUPPORTED_LOCALES.includes(locale)) {
    return locale;
  }
  return DEFAULT_LOCALE;
};

const translateWithLocale = (key, locale) => {
  const target = String(key || "");
  if (!target) {
    return "";
  }
  const canonicalLocale = resolveLocale(locale);
  const exact = MESSAGES[canonicalLocale]?.[target];
  if (exact) return exact;
  if (canonicalLocale === "en-US" && CHINESE_CHAR_RE.test(target)) {
    for (const { pattern, names, translation } of MESSAGE_TEMPLATES) {
      const match = target.match(pattern);
      if (!match) continue;
      const values = Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
      return translation.replace(/\{(\w+)\}/g, (_placeholder, name) => values[name] ?? "");
    }
  }
  return target;
};

const translateText = (value, locale) => {
  const source = String(value || "");
  const exact = translateWithLocale(source, locale);
  if (exact !== source) return exact;
  if (resolveLocale(locale) !== "en-US" || !CHINESE_CHAR_RE.test(source)) return source;
  return Object.keys(MESSAGES["en-US"])
    .filter((key) => key && CHINESE_CHAR_RE.test(key) && source.includes(key))
    .sort((left, right) => right.length - left.length)
    .reduce((result, key) => result.split(key).join(MESSAGES["en-US"][key]), source);
};

const renderTemplate = (text, locale) => {
  return text.replace(PLACEHOLDER_RE, (match, _quote, key) => {
    return translateWithLocale(key, locale);
  });
};

const shouldTranslate = (text) => CHINESE_CHAR_RE.test(text);

const localizeNodeText = (node, locale) => {
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    return;
  }
  if (node.parentElement?.closest('[translate="no"]')) return;
  // Our own mutation must not translate Chinese inside a preserved user value
  // a second time after a message template has already been localized.
  const previous = LOCALIZED_TEXT_VALUES.get(node);
  if (previous?.locale === locale && previous.value === node.textContent) return;
  const next = (() => {
    const rendered = renderTemplate(node.textContent || "", locale);
    if (rendered !== node.textContent) {
      return rendered;
    }
    const trimmed = rendered.trim();
    if (!trimmed) {
      return rendered;
    }
    const translated = translateText(trimmed, locale);
    return translated === trimmed ? rendered : translated;
  })();
  if (next !== node.textContent) {
    LOCALIZED_TEXT_VALUES.set(node, { locale, value: next });
    node.textContent = next;
  }
};

const localizeNodeAttributes = (element, locale) => {
  if (!element || element.nodeType !== Node.ELEMENT_NODE || !element.attributes) {
    return;
  }
  if (element.closest('[translate="no"]')) return;
  for (const attribute of Array.from(element.attributes)) {
    if (!TRANSLATABLE_ATTRIBUTES.has(attribute.name)) {
      continue;
    }
    const previous = LOCALIZED_ATTRIBUTE_VALUES.get(element)?.get(attribute.name);
    if (previous?.locale === locale && previous.value === attribute.value) continue;
    const next = translateText(renderTemplate(attribute.value || "", locale), locale);
    if (next !== attribute.value) {
      let values = LOCALIZED_ATTRIBUTE_VALUES.get(element);
      if (!values) {
        values = new Map();
        LOCALIZED_ATTRIBUTE_VALUES.set(element, values);
      }
      values.set(attribute.name, { locale, value: next });
      element.setAttribute(attribute.name, next);
    }
  }
};

const localizeNode = (node, locale) => {
  if (!node) {
    return;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (TEXT_NODE_SKIP_TAGS.has(node.tagName) || node.closest('[translate="no"]')) {
      return;
    }
    localizeNodeAttributes(node, locale);
    for (const child of Array.from(node.childNodes)) {
      localizeNode(child, locale);
    }
    return;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    localizeNodeText(node, locale);
    return;
  }
};

const setupDynamicObserve = (root, options) => {
  if (!root || !globalThis.MutationObserver) {
    return () => {};
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") {
        localizeNode(record.target, options.locale);
      }
      if (record.type === "attributes") {
        localizeNodeAttributes(record.target, options.locale);
      }
      for (const node of Array.from(record.addedNodes || [])) {
        localizeNode(node, options.locale);
      }
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: Array.from(TRANSLATABLE_ATTRIBUTES),
  });
  return () => observer.disconnect();
};

const resolveRoot = (root) => {
  if (!root) {
    return null;
  }
  if (root.nodeType === Node.DOCUMENT_NODE && root.documentElement) {
    return root.documentElement;
  }
  return root;
};

export const createI18nRuntime = (options = {}) => {
  const {
    initialLocale,
    root = globalThis.document,
    autoApply = true,
    observe = true,
  } = options;

  let locale = resolveLocale(initialLocale);
  const runtimeRoot = resolveRoot(root);
  let cleanupObserver = () => {};

  const apply = (target = runtimeRoot) => {
    if (!target) {
      return;
    }
    localizeNode(target, locale);
  };

  const setLocale = (nextLocale) => {
    locale = resolveLocale(nextLocale);
    apply(root);
    return locale;
  };

  const t = (key) => translateWithLocale(key, locale);
  const i18n = {
    get locale() {
      return locale;
    },
    t,
    setLocale,
    apply,
    renderTemplate: (value) => renderTemplate(String(value || ""), locale),
    shouldTranslate,
  };

  if (autoApply && runtimeRoot) {
    apply(runtimeRoot);
  }
  if (observe && runtimeRoot) {
    cleanupObserver = setupDynamicObserve(runtimeRoot, i18n);
  }
  i18n.stop = () => {
    cleanupObserver();
  };

  return i18n;
};
