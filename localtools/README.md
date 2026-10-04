# 本地终端兼容工具

仅用于 PC 本地模式：保留旧客户端的 GB18030 输出兼容、Latin-1 中文乱码修复和 nano 打开旧编码文件后保存 UTF-8 的能力。容器终端不加载这些适配。

text.go 的 Reader 保留跨 Read 的未完成字符；nano.go 通过临时 PATH shim 调用同一终端二进制的 nano 子命令，不写入或替换用户 rc、ZDOTDIR/BASH_ENV/ENV。只有 nano 成功退出后才回写转换文件。

依赖标准库和 x/text，不拥有会话或权限。调用方在服务关闭时回收 shim 目录。验证使用实际 PTY 和真实编码文件，重点检查分片、UTF-8 原样输出及 nano 取消不写回。
