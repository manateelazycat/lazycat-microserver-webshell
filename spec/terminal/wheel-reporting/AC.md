# 场景 1：细小滚动按累计位移上报
ID: SC-TERMINAL-WHEEL-DISTANCE
Profile: draft
Gate: required
Given 用户在 WebShell 中运行开启鼠标上报的终端程序，终端字号保持不变
When 用户使用触控板连续同方向小幅滚动
Then 程序收到的滚轮输入按累计位移换算，每满一个终端行高上报一次，不因位移被拆成更多事件而放大
And 不足一行的位移保留给后续同方向滚动，不触发 WebShell 历史回滚或方向键输入

# 场景 2：明确标记的惯性不继续驱动终端程序
ID: SC-TERMINAL-WHEEL-MOMENTUM
Profile: draft
Gate: required
Given 用户使用能明确标记惯性滚动的浏览器，在 WebShell 中运行开启鼠标上报的终端程序
When 用户滑动触控板后抬起手指，浏览器继续产生标记为惯性的滚动
Then 这些惯性事件不再向终端程序发送滚轮输入，也不触发 WebShell 历史回滚或方向键输入
And 再次主动滑动触控板时仍可按位移滚动终端程序
