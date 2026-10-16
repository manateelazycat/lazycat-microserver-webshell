# PC 工作区

本模块独立拥有新版 PC 侧栏、实例分组收放和按实例分组的总览 DOM。唯一入口是 `createDesktopWorkspaceController()`；全局运行时只注入实例快照、工作区命令、预览和布局回调，并编排 start/dispose。

`directory_controller.js` 通过已鉴权的 `api/workspace?inspect=1` 查询后台实例的元数据，不创建 PTY、WebSocket、终端或历史回放，也不把后台快照应用到当前工作区。并发最多三个，侧栏或总览可见时每 15 秒更新；页面隐藏时不请求，切出新版模式后取消请求。selector、工作区 generation 和请求版本共同隔离快照。预览复用 overview 的独立图片存储，缺少画面时显示无预览。

侧栏中的会话对应现有 tab，原分屏完整保留。按钮复用现有预览、文件和选项入口；切回传统 PC 或移动布局时恢复原 DOM 位置。新版仅隐藏顶部标签专属入口，保留会话 CRUD 和快捷键。终端本体不属于本模块。

手工验证：容器/物理机/停止实例、跨实例同名会话、包含分屏的会话、创建/关闭/双击改名、预览选择、侧栏及实例连续收放、减少动态效果、传统布局开关、移动布局和窗口尺寸变化。产品合同见 `spec/workspace/desktop-navigation/`。
