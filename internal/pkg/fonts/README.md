# 字体与终端设置

维护字体名称/资源解析、设置存储及终端配置默认值。`name.go` 处理字体名称，`store.go` 维护存储和校验；Provider 使用完整设置能力，Core 仅使用历史行数等配置定义。

`State()` 提供设置快照，`ReadSettings()` / `WriteSettings()` 负责文件读取与原子保存，`SaveSettings()` / `MergeSettings()` 校验用户设置。`terminal_cursor_style` 保存浏览器光标样式，只接受 `block`、`bar` 和 `underline`；旧配置缺失或读取到未知值时使用默认 `block`，显式保存无效值时报参数错误。不得添加 PTY/平台操作或依赖 Provider。

根目录执行 `go build ./internal/pkg/fonts`；手测字体选择、上传/删除、光标样式和历史行数设置，并检查刷新后配置保留及旧配置默认块状光标。

`mobile_pre_input_enabled` 保存移动端预输入开关，缺失时为 false；原子保存其他设置时保留此字段。手工验证首次默认关闭、启用后刷新保留、关闭后刷新保持关闭，以及修改字体后不丢失开关。
