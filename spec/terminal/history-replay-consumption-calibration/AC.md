# 场景 1：显示会话真实历史量和当前回放消费
ID: SC-SHOW-SESSION-HISTORY-REPLAY-CALIBRATION
Profile: draft
Gate: required
Given 用户开启调试模式、网络监视器和历史回放消费校准，并有终端会话开始历史回放
When 用户查看每个会话右上角的校准信息
Then 会话显示“当前历史回放流量消费”和“当前会话历史总字节大小”两个 MB 数值
And 历史总字节来自服务端当前实际保留的数据量，而不是终端历史行数对应的容量上限
And 状态快照恢复的消费包含压缩快照有效载荷及其后的原始增量

# 场景 2：回放完成后识别异常消费
ID: SC-DETECT-ABNORMAL-HISTORY-REPLAY-CONSUMPTION
Profile: draft
Gate: required
Given 服务端声明当前会话历史总字节和本次应回放字节，浏览器记录本次实际接收的历史回放字节
When 本次历史回放完成
Then 实际接收量大于本次应回放字节时标记为超量异常
And 实际接收量不足本次应回放字节一半时标记为缺失异常
And 正常的增量或无需回放场景不因完整历史总量较大而误报
And 压缩快照不与未压缩历史总量直接比较，分片采集不完整时明确标注采样不完整

# 场景 3：校准展示跟随调试开关生命周期
ID: SC-HISTORY-REPLAY-CALIBRATION-DEBUG-GATE
Profile: draft
Gate: required
Given 用户可以控制调试模式、网络监视器和历史回放消费校准
When 任一必要开关关闭
Then 每个会话不显示历史回放消费校准信息
And 网络监视器关闭时校准采样与网络统计一同停止并清空
