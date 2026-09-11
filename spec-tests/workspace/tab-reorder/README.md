# 工作区顶部标签拖拽排序

规格：[REQ](../../../spec/workspace/tab-reorder/REQ.md) · [AC](../../../spec/workspace/tab-reorder/AC.md)。环境与目标：[ENVIRONMENT](../../ENVIRONMENT.md)。

## 场景

- `desktop.mjs`：在真实桌面 Chrome、真实 workspace API 和 persistent agent 中创建测试标签，拖动非活动标签，核对激活、单次原子排序请求、服务端顺序及刷新后的 UI 顺序。
- `touch.mjs`：在真实移动浏览器上下文中确认普通移动布局仍使用终端总览；开启 debug 强制 PC 模式后通过浏览器触摸输入长按并拖动标签，核对持久化顺序。

测试只关闭本模块创建的额外标签；环境 harness 创建并拥有的隔离标签仍由统一清理流程回收。运行器保存最终截图、Chrome trace、事件日志和 `tab-reorder.json`。

## 运行

```sh
./run-ac.sh --selector workspace/tab-reorder
```

正式验收必须使用当前工作树构建并部署的 WebShell LPK，且目标 persistent agent 声明原子锚点排序 capability。只替换浏览器静态资源不足以证明新增服务端协议已生效。
