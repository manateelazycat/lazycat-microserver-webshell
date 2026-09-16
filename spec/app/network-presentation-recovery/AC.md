# 场景 1：网络恢复后原终端继续显示实时输出
ID: SC-NETWORK-PRESENTATION-RECOVERY
Profile: draft
Gate: required
Given 用户已有可交互的终端及另一个独立会话
When 终端短暂断网并恢复，用户继续输入、切换标签和调整可用显示区域
Then 原终端无需刷新页面或重新创建即可显示实时输出及新的命令结果
And 其他会话仍可正常使用

# 场景 2：离线等待期间仍可浏览已有终端内容
ID: SC-OFFLINE-TERMINAL-LOCAL-BROWSING
Profile: draft
Gate: required
Given 用户已有加载完整且可滚动的终端历史，本地终端仍正常运行
When 网络断开或重新连接尚未建立，用户滚动历史、选择并复制文本，切换标签后返回
Then 用户仍能浏览已加载的历史并复制所选文本，画面随本地滚动和选择更新
And 连接状态仍如实显示离线或等待恢复，本地浏览不被当作远程连接已恢复
