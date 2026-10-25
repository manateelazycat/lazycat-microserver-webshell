# 客户端终端运行时

本模块提供 Linux、macOS 和 Windows 原生终端运行时，支持终端会话、文件访问、SSH、端口转发和资源指标。

## 模块结构

- `main.go`：程序入口；`platform_*.go`：平台装配。
- `managedruntime/`：启动配置、进程锁、续期及退出管理。
- `buildtools/`：准备固定版本的 Go 工具链。
- `build.mjs`：跨平台构建、产物摘要和 manifest。
- `refresh-manifest.cjs`：打包签名后更新产物摘要。

## 构建

在 Webshell 根目录运行 `node clientruntime/build.mjs`。可使用 `--platform=win32 --arch=x64` 或 `--platform=darwin --arch=arm64` 指定目标。

产物位于 `clientruntime/output/<平台>-<架构>/versions/<摘要>/`，名称为 `terminal-core`，Windows 为 `terminal-core.exe`。使用 `--json=true` 获取包含 `artifact_dir` 的 JSON 构建结果。

## 验证

在本模块目录使用构建工具准备的 Go 执行 `go build ./...` 和 `go vet ./...`。功能验证包括终端、文件、SSH/SFTP、端口转发及续期；打包后核对目标平台、摘要和 manifest。
