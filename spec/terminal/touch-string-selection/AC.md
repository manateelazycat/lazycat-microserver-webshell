# 场景 1：长按自动选中完整连续字符串
ID: SC-TOUCH-SELECTION-CONTINUOUS-STRING
Profile: draft
Gate: required
Given 用户在手机或平板上浏览终端，内容包含英文单词、文件路径、中文短句和组合字符
When 用户长按其中一段文字的内部，或宽字符的任一半格
Then 自动选中触摸处所属的完整连续字符串，英文保留词或路径的内部连接符，中文在空白和标点处结束
And 宽字符、emoji 和组合字符保持完整，原有选择操作栏及手柄可继续使用

# 场景 2：长按后选区稳定且仍可手动调整
ID: SC-TOUCH-SELECTION-STABLE-ADJUSTMENT
Profile: draft
Gate: required
Given 用户已通过长按自动选中一个连续字符串
When 用户轻微移动手指、继续拖动扩选，随后松手并拖动选区手柄
Then 轻微抖动不缩回少量字符，继续拖动可以扩选，手柄可以缩小或扩大选区
And 普通终端和已适配本地长按选择的全屏终端程序遵循相同规则

# 场景 3：边界不连接无关内容
ID: SC-TOUCH-SELECTION-BOUNDARIES
Profile: draft
Gate: required
Given 终端有被空白、标点或界面边框隔开的片段，也有自动折行的连续文字
When 用户分别长按这些文字及边界位置
Then 独立片段不会被连成一个选区，可以确认的自动折行保留连续字符串的选择
And 长按空白或边界字符时不自动带出相邻文字
