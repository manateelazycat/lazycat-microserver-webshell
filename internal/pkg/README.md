# 现有公共包

当前包含 [fonts](fonts/README.md)，供 Provider 设置和 Core 历史配置使用。第一阶段不迁移或改变其存储格式、配置默认值。

新增包应按独立职责命名并提供 README；不要将业务代码堆成通用工具集合。构建检查为仓库根目录 `go build ./internal/pkg/...`。
