# tests-auto

这里的编号目录是项目既有的测试分类；每个目录保留 `test.mjs` 与完整 `README.md`，并由 `spec-tests/ac-implementations.json` 映射到产品 `spec/` 中的 AC 场景。

环境准备统一见 [ENVIRONMENT.md](../ENVIRONMENT.md)：测试机 URL、`.env`/环境凭据、自动登录、实例回退、Google Chrome 双窗口、X11 DISPLAY 和目标 origin 的 local-network-access 权限。

产品根目录的 `./run-ac.sh` 默认全量，经过唯一执行器调用本目录 `test-all.sh`。执行器传入完整选择，批次只执行这些模块；每个模块保持原有断言和独立证据。

```sh
# 产品根目录
./run-ac.sh
./run-ac.sh --selector webshell/02-terminal-input
./run-ac.sh --dry-run
# 独立批次也可从任意目录调用
TESTS_AUTO_DRY_RUN=1 ./spec-tests/tests-auto/test-all.sh
./spec-tests/tests-auto/test-all.sh --case 02-terminal-input
```

默认使用有界面 Google Chrome；`TEST_FOREGROUND=0` 或 `HEADLESS=1` 才显式改为无头。普通模块创建桌面与移动布局两个窗口，声明 desktopOnly 或主动关闭辅助窗口的模块按自身边界执行。

全量批次不会在单个模块失败后把其余模块省略为通过，而会继续收集结果。公共配置无法使用时直接报告环境错误；模块缺少客户端目标、出现跳过或清理失败均不作为通过。每次结果由 `result.json` 与原事件日志核对，历史 README 的通过记录不代表本轮通过。

正式执行时自动构建最新前端，整批使用同一份带摘要的快照；缺失资源不回退远端。04 保留移动 UA 配置，11 在本地前端下运行独立 Worker 生命周期，17 要求真实 client: 终端。请先阅读所选模块的前提和限制。
