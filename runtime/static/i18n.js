const DEFAULT_LOCALE = "zh-CN";
const SUPPORTED_LOCALES = ["zh-CN", "en-US"];
const MESSAGES = {
  "zh-CN": {},
  "en-US": {
    "终端总览": "Terminal Overview",
    "文件管理": "File Management",
    "终端": "Terminal",
    "新建标签": "New Tab",
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
    "终端设置": "Terminal Settings",
    "主题设置": "Theme Settings",
    "手机快捷键设置": "Mobile Shortcuts Settings",
    "PC快捷键设置": "PC Shortcuts Settings",
    "服务转发设置": "Service Forwarding Settings",
    "字体": "Font",
    "显示": "Display",
    "滚动历史": "Scrollback",
    "鼠标": "Mouse",
    "快捷键栏": "Shortcut Bar",
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
    "双击屏幕提醒": "Double-Tap Reminder",
    "熟悉手机双击进入编辑的操作后,可以关闭这个选项": "After getting used to double-tap to enter edit mode, you can disable this option.",
    "鼠标选中复制、中键粘贴": "Select with left click to copy, paste with middle click",
    "桌面端左键选中后自动复制，中键粘贴剪贴板内容": "On desktop, left selection auto-copies and middle click pastes clipboard contents",
    "在PC中开启底部快捷键栏": "Enable bottom shortcut bar on PC",
    "默认关闭；开启后始终显示终端快捷键栏": "Disabled by default; when enabled, the terminal shortcut bar is always visible.",
    "在懒猫微服 PC 客户端中启用「接入 LightOS」后，这台物理机将作为客户端实例接入 LightOS，并允许你从 LightOS 访问其终端和相关资源。": "After enabling \"Access LightOS\" in the Lazycat Microserver PC client, this machine becomes a client instance for LightOS, allowing terminal and related resource access from LightOS.",
    "多屏输出说明": "Multi-Screen Output Notes",
    "PTY 是内核输出，内核无法同时输出不同分辨率的 Shell 结果，所以多设备同时用时，PTY 的输出分辨率会按照正在交互的设备的分辨率输出，其他没有交互的设备分辨率会发生变化，这个不是 bug，是技术限制。当你切换到不同终端时，WebShell 会自动用当前交互设备的分辨率重新布局终端界面。": "PTY output comes from the kernel and cannot render different-resolution shells simultaneously; when multiple devices interact at once, output resolution follows the active device, so non-active device resolution may change. This is a technical limitation. When you switch terminals, WebShell reflows the terminal using the current active device resolution.",
    "调试模式": "Debug Mode",
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
    "在终端右上角显示 WebSocket 通道和 MB 流量，默认关闭": "Show WebSocket channels and MB traffic in the terminal top-right, disabled by default",
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
    "不使用账号保护": "No Account Protection",
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
    "关闭其他标签": "Close Other Tabs",
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
    "不使用账号保护": "No account protection",
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
    "确认更新": "Confirm Update",
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
  },
};

const PLACEHOLDER_RE = /\{\{\s*\$t\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1\s*\)\s*\}\}/g;
const TEXT_NODE_SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
const TRANSLATABLE_ATTRIBUTES = new Set(["aria-label", "title", "placeholder"]);
const CHINESE_CHAR_RE = /[\u4e00-\u9fff]/;

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
  return MESSAGES[canonicalLocale]?.[target] || target;
};

const translateText = (value, locale) => {
  const source = String(value || "");
  const exact = translateWithLocale(source, locale);
  if (exact !== source) return exact;
  if (resolveLocale(locale) !== "en-US") return source;
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
    node.textContent = next;
  }
};

const localizeNodeAttributes = (element, locale) => {
  if (!element || element.nodeType !== Node.ELEMENT_NODE || !element.attributes) {
    return;
  }
  for (const attribute of Array.from(element.attributes)) {
    if (!TRANSLATABLE_ATTRIBUTES.has(attribute.name)) {
      continue;
    }
    const next = translateText(renderTemplate(attribute.value || "", locale), locale);
    if (next !== attribute.value) {
      element.setAttribute(attribute.name, next);
    }
  }
};

const localizeNode = (node, locale) => {
  if (!node) {
    return;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (TEXT_NODE_SKIP_TAGS.has(node.tagName)) {
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
      for (const node of Array.from(record.addedNodes || [])) {
        localizeNode(node, options.locale);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
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
