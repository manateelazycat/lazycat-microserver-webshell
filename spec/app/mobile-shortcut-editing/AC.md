# 场景 1：整项长按排序且编辑短按可用
ID: SC-MOBILE-SHORTCUT-ROW-REORDER
Profile: draft
Gate: required
Given 用户打开包含多个选项的手机快捷键设置列表
When 用户短按一个选项右侧的编辑按钮，再返回列表并长按该选项的内容或编辑按钮后拖到新位置
Then 短按打开对应选项的编辑界面，长按拖动后列表显示新顺序
And 用户重新打开设置后仍看到该顺序

# 场景 2：拖动到边缘时继续浏览列表
ID: SC-MOBILE-SHORTCUT-EDGE-SCROLL
Profile: draft
Gate: required
Given 用户打开内容超出可见区域的手机快捷键设置列表
When 用户长按一个选项并把它拖到可见区域的顶部或底部边缘
Then 列表持续向相应方向滚动，用户可以将选项放到原先不可见的位置

# 场景 3：拖动期间另一根手指滚动
ID: SC-MOBILE-SHORTCUT-TWO-FINGER-SCROLL
Profile: draft
Gate: required
Given 用户打开内容超出可见区域的手机快捷键设置列表并已长按拖起一个选项
When 用户保持拖动手指不离开，同时用另一根手指上下滑动列表
Then 列表随第二根手指滚动，被拖动的仍是原来的选项
And 用户松开拖动手指后列表显示所选的新位置

# 场景 4：直接滑动仍可浏览列表
ID: SC-MOBILE-SHORTCUT-SWIPE-SCROLL
Profile: draft
Gate: required
Given 用户打开内容超出可见区域的手机快捷键设置列表
When 用户不长按，直接从一个选项上上下滑动
Then 列表随手指滚动，快捷键顺序保持不变
