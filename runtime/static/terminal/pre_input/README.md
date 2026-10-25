# 移动端预输入

本目录独立维护草稿、附件待发送列表、工具栏、顺序上传和发送生命周期。`index.js` 导出控制器并加载本模块样式；`pre_input_view.js` 创建和更新 DOM，`pre_input_controller.js` 管理交互与资源释放。

模块不导入设置、附件管理、工作区或终端内部实现。全局运行时注入 `isEnabled`、`isMobileLayout`、`getContext`、`uploadFile`、`validateFiles`、`formatPaths`、`sendText`、`registerSessionCleanup` 与布局/键盘回调。`validateFiles` 返回附件校验结果 `{ error, oversized }`；`uploadFile` 返回 `{ promise, xhr }`；成功结果包含单个 `files[].path`；`sendText` 同步返回输入队列是否接受内容，不追加回车。模块将所有附件路径置于文字前一次发送，路径转义由注入的格式化能力负责。

预输入框挂载在快捷键两行之后，共享既有键盘避让和安全区。启用时通过 ResizeObserver 测量完整底栏高度，草稿、附件和工具栏变化均为终端保留空间。开关关闭或销毁时恢复原高度策略。

草稿按终端会话隔离，仅在点击发送后逐个上传；成功路径保留到发送成功，失败重试跳过已上传附件。切换会话、实例、退出移动布局或关闭开关时取消当前上传并禁止迟到发送；终端销毁时回收草稿和图片 Object URL，页面销毁时释放全部监听、观察器和上传。

需求见 `spec/terminal/pre-input/`。默认由开发者手工验证开关刷新、多行中文输入、图片和文件混选、移除、仅附件、空草稿、上传失败重试、上传中切换终端，以及键盘打开/收起和横竖屏。`npm run build` 为构建检查，不能视为真机验收。
