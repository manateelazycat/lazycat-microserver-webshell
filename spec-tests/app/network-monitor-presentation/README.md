# Android 网络监视器验收

目标规格：[REQ](../../../spec/app/network-monitor-presentation/REQ.md) · [AC](../../../spec/app/network-monitor-presentation/AC.md)。真实环境和设备要求见 [ENVIRONMENT](../../ENVIRONMENT.md)。

`android.mjs` 在 Pixel 9 Pro 模拟器的 LightOS 应用中创建两个专用标签，开启调试模式和网络监视器并产生真实终端流量；检查移动顶部栏的流量、用量、状态与终端不重叠，横屏时检查两个标签各自的摘要。测试恢复原设置和旋转，并清理标签。该 draft AC 使用精确 ID 运行：

```sh
./run-ac.sh --selector app/network-monitor-presentation/SC-NETWORK-TRAFFIC-BY-WORKSPACE-AND-TAB --target android-emulator
```

`android-debug-gate.mjs` 已能观察到关闭任一开关后统计消失、采样定时器停止；当前设备 WebView 尚缺稳定的会话连接监听释放观察面，`SC-NETWORK-MONITOR-DEBUG-GATE` 保持未承接，不能报告通过。
