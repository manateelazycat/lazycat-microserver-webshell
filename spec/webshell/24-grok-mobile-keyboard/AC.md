# 场景 1：进入 Grok 后可以直接双击展开键盘
ID: SC-GROK-MOBILE-KEYBOARD
Profile: draft
Gate: required
Given 用户在移动布局打开已经进入 Grok 的终端
When 用户直接双击终端画面
Then 系统键盘展开，无需先点工具栏或其他按钮
And 该次双击不会当作 Grok 界面里的一次点击
