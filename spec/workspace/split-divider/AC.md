# 场景 1：拖动分屏分割条时各终端画面保持独立
ID: SC-SPLIT-DIVIDER-RENDER-ISOLATION
Profile: standard
Gate: required
Given 左右分屏分别显示密集内容和空白终端
When 用户连续来回拖动分割条并释放
Then 两侧画面各自保持独立，尺寸随拖动更新且最终比例符合释放位置
