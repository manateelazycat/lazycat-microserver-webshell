# 终端构建专用 Go 工具链

Webshell 的 `clientruntime/build.mjs` 通过本模块的 `cmd/prepare` 准备终端工具链。它使用 Go 标准库，在构建时运行，可由 Go 1.24.4 或更高版本编译。

`manifest.json` 固定 Go 1.26.8 和 Go 官方发布归档的大小、SHA-256。选择依据是构建机系统和 CPU，不是交叉编译目标。升级时从文件中标明的官方发布索引核对并更新版本及全部归档摘要，不能在构建时动态选择 latest。

`Ensure` 下载、校验、解压并原子发布独立工具链，返回绝对可执行文件路径。默认缓存位于用户缓存目录的 `lazycat/terminal-go/`，包含已校验归档和解压目录；再次调用会核对归档及 Go 版本，不访问网络。缓存校验失败时直接报错，不回退 PATH 中的 Go，不覆盖可能仍被其他构建使用的目录。

下载归档必须匹配提交的官方大小和 SHA-256。每个源最多等待 2 分钟，准备过程最多 5 分钟；网络连接和响应头另有较短超时。可通过 `TERMINAL_GO_DOWNLOAD_BASE` 指定其他镜像的目录 URL，文件名保持官方格式；设置后只访问该镜像，不回退公网。`TERMINAL_GO_CACHE` 可指定独立缓存根目录。

在 Webshell 仓库根目录预热构建机的缓存：

```sh
GOTOOLCHAIN=local GOWORK=off go -C clientruntime/buildtools run -mod=readonly ./cmd/prepare
```

Windows PowerShell 可先设置 `$env:GOTOOLCHAIN='local'`、`$env:GOWORK='off'`，再运行同一条 `go run` 命令。预热和正式构建须使用相同账号或显式指定同一个缓存目录。标准输出只返回 Go 路径，下载信息输出到标准错误。

同一工具链通过目录锁串行准备，不同宿主平台或版本使用独立目录。正常退出或可处理的中断会清理临时目录与锁；强制终止后，须确认没有构建进程再移除报错所指的残留锁。损坏缓存也应在确认没有使用者后移走，再重新预热。

客户端终端编译显式使用此路径及 `GOTOOLCHAIN=local`、`GOWORK=off`，不继承其他安装的 `GOROOT`，也不修改全局 PATH 或 `go env`。SSH 依赖版本及各模块的 `go.mod` 不由本工具改写。
