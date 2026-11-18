# 场景 1：两端图片随终端内容一致呈现
ID: SC-CROSS-CLIENT-IMAGE-GEOMETRY
Profile: draft
Gate: required
Given 用户在原生客户端和 Web 客户端连接远端终端，两端网格和单元格像素尺寸相同，远端程序输出相同的 Kitty Graphics direct 图片及关联文字
When 用户分别查看图片、滚动终端、调整到相同的新尺寸并切换后返回该标签
Then 两端图片的尺寸、位置、裁剪、层级及随文字移动的行为一致
And 与相同条件下 Ghostty 的终端图片行为一致，不将协议内容作为正文显示
