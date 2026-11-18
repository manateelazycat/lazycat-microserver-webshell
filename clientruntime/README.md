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

历史运行时 v47 通过私有 Unix 域套接字接收 HTTP/WebSocket，不监听 TCP。调用方复用原版 hportal 的 RegisterHTTP 和权限服务；转发前执行同连接挑战验证。PTY 和解析器继续在本机，临时断线保留任务，宿主独立维护入口有效期。

`node clientruntime/release.mjs --output=<directory>` 构建七个平台的 gzip 产物和不可变版本清单，包含 Linux riscv64。每台设备仅下载自身目标。CI 可用 `--platform` 与 `--arch` 生成单一目标，在合并分发清单前核对七个目标齐全。

macOS 发行节点通过 `TERMINAL_MAC_SIGN_IDENTITY` 签名并验证独立产物；Windows 发行节点通过 `TERMINAL_WINDOWS_SIGN_TOOL` 指定现有签名工具，工具接收二进制路径。最终摘要在签名后计算。开发构建不声称完成正式发行签名，正式流水线应检查所需签名步骤。

签名在独立发布目录进行，不修改构建工具的不可变版本缓存。macOS 保留终端解析器所需的 JIT/可执行内存权限。Windows 可用 `TERMINAL_WINDOWS_VERIFY_TOOL` 接入发行验证工具。`TERMINAL_REQUIRE_PLATFORM_SIGNATURES=1` 会拒绝缺少平台签名的非 Linux 产物。

各发行节点生成对应目标后，使用 `node clientruntime/merge-release.mjs --output=<directory> <platform-directories...>` 校验并合并七个平台的最终清单。它拒绝缺失或重复目标、混合源码/协议以及摘要不符的产物。LPK 构建可通过 `TERMINAL_RUNTIME_RELEASE` 消费合并后的发行目录；未配置时生成并明确标记开发产物。

LightOS 的最终打包阶段追加 `--version=<lightos-admin/package.yml版本>`，给七平台和顶层清单写入相同的 version；输入和输出可用同一目录。该版本用于 launcher 对外状态，具体二进制继续由 SHA256 定位和校验。重复合并保留版本，混合版本输入必须显式指定最终 LPK 版本才能合并。

发行清单记录嵌入的 `wasm_sha256`，七个平台必须一致，并与 LPK 当前构建的 WASM 一致。工作区有并行修改时使用固定源码快照构建；可用 `TERMINAL_SOURCE_SNAPSHOT_SHA256` 记录开发快照摘要。正式发行仍要求已提交源码和对应平台签名。

WASM 执行引擎自动选择平台支持的实现：amd64/arm64 通常使用编译器，Linux riscv64 使用解释器。七平台构建成功不代替相应设备的性能及功能验证。

在本模块目录使用构建工具准备的 Go 执行 `go build ./...` 和 `go vet ./...`。功能验证包括终端、文件、SSH/SFTP、端口转发及续期；打包后核对目标平台、摘要和 manifest。

## Launcher v4

同一平台产物提供 launcher 和 worker 两种模式。宿主在现有登录链路上换取限实例凭据，通过私有 stdin 交付。launcher 执行 LightOS 注册、业务心跳、版本准备和空闲 worker 切换；宿主保留进程所有权、账号绑定及应用入口续期和撤权。运行中的 worker 不被覆盖，launcher 本身在下次显式启用时更新。worker 异常退出如实报告，不自动循环拉起。

清单使用 `launcher_protocol: 4` 和 `channel_protocol: 0`；后者表示不依赖新增的公共 SDK 通道协议。私有 IPC 地址由 worker 经 launcher 返回宿主，不放入业务注册数据。

launcher v5、终端 v48 阶段：原 SDK gRPC 注册承载私有 Unix 应用流，终端/SSH/文件/发布仍在本机运行。应用传输和证书实现由本仓库 clienttransport 维护，不给 hportal 增加源码依赖。

运行时 v49 在 launcher/worker 进程入口统一清理内部代理环境变量及 ELECTRON_RUN_AS_NODE，宿主和 worker 启动器不再重复过滤；nano/version 模式保留调用方环境。微服代理仍由私有 proxy_url 配置显式提供，用户 shell 配置行为不变。CLI/PC 透传 bootstrap 扩展字段，launcher v5 控制协议保持兼容。

## 进程内通用 PTY（Agent v52）

物理机网页和 SSH PTY 编译复用 hportal 的 CLI 范围内轻量封装 `gitee.com/linakesi/hportal/misc/cli/pty`，固定到仓库提交对应版本。它只提供底层 PTY 适配，不引入 hportal 网络核心，也不增加 PTY RPC/端口；解析、shell、授权、保留会话、Job/进程回收和热更新仍由本运行时维护。库随运行时重新构建并由 LPK 分发，不要求宿主 daemon 执行 PTY。兼容原终端帧、launcher v5、host_protocol 1、SSH/发布和 WASM；Provider 显式保留 v51 attach/工作区能力。正常构建使用锁定依赖，不依赖本地 go.work 或开发机路径。

Agent v58 接入官方 Ghostty 图片核心与按序查询应答，详见 `core/README.md`。七平台需重新构建，并由 LPK 门禁核对每份清单的 `wasm_sha256` 与当前前端相同。图片会话仍使用既有原始历史回放；非图片会话继续使用 GHOSTSNP。现有 launcher/host 协议不变，兼容旧 Agent 不表示可跨不兼容 WASM 导入状态，也不自动替换用户正在使用的进程。
