# 场景 1：拖到目标终端后完成上传并写入路径
ID: SC-ATTACHMENT-FILE-DROP-PANE
Profile: draft
Gate: required
Given 用户打开支持附件且可交互的桌面终端
When 用户把文件拖到某个终端画面并松开
Then 拖动期间该画面显示可放下的遮罩和文件名
And 松开后出现上传进度
And 成功后远端路径只进入该终端一次，且不会自动执行

# 场景 2：分屏时文件进入指针所在的那一侧
ID: SC-ATTACHMENT-FILE-DROP-SPLIT-TARGET
Profile: draft
Gate: required
Given 用户在同一标签中分屏出两个可交互终端
When 用户把文件拖到非当前焦点的那一侧并松开
Then 上传结果进入松开时所在的那一侧，另一侧保持不变

# 场景 3：拖入文件夹被拒绝且终端不变
ID: SC-ATTACHMENT-FILE-DROP-FOLDER-REJECT
Profile: draft
Gate: required
Given 用户打开支持附件且可交互的桌面终端
When 用户把文件夹拖到终端画面并松开
Then 用户看到无法上传文件夹的说明
And 终端没有新增路径，也没有开始上传
