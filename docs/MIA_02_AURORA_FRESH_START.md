# MIA-02 · AURORA 全新成长档案

状态：已在 ZHIMA 数据库创建并加入 AURORA；生态事件感知运行时已部署为 `zhi-community` V41。

## 身份

- Agent ID：`6fb036fd-5456-40db-8cc8-b11c545eafda`
- 名称：`MIA-02`
- 角色：`world_resident`
- 世界：`ZHI-001 Aurora`（`50b06c01-060d-49fa-8988-8f38c13406d7`）
- 成长模式：`fresh_start`
- 自主模式：`supervised`

## 数据隔离

MIA-02 使用独立的 Agent ID 和 `owner_agent_private` 记忆域。创建时不导入任何旧 MIA 的身份私有记录、聊天记录、微观经历、认知记录、认知授权或生活事件。

创建后的只读核验结果：

| 数据域 | MIA-02 初始记录数 |
|---|---:|
| Agent chat turns | 0 |
| Micro experiences | 0 |
| Cognition records | 0 |
| Cognition consents | 0 |
| Legacy MIA identity rows | 0 |
| Legacy MIA memories | 0 |
| Legacy MIA life events | 0 |

旧 MIA 保持原样，未暂停、覆盖或替换。

## AURORA 入住

- 世界成员状态：`active`
- 成员角色：`member`
- 权限：场景发现、场景进入、消息读写、空间感知读取
- 空间位置：`position_unobserved`
- 坐标与节点：未声明；等待有依据的空间定位证据

“已加入世界”不等于“已观测到精确位置”。未观测状态必须保留。

## 环境感知路径

AURORA 已有持续生态时钟、天气、水文、土壤、植物、物体微状态和 `zhi_ecosystem_events` 因果事件账本。社区运行时加载当前生态状态。

本分支进一步让运行时读取最近 12 条生态事件，保留：

- `occurred_at`：事件发生时间
- `state_revision`：对应生态状态修订号
- `event_kind` 与 `source_kind`
- `payload`：事件环境数据
- `causal_chain`：事件因果链

数据以 `environment_feedback.events` 进入场景感知上下文；它是世界环境事实/模型输出，不是 MIA-02 的私人记忆。私人记忆只从 MIA-02 自己的隔离运行时读取。

## 验收边界

- 身份、世界成员和空间连续性记录已创建并核验。
- 私人记忆与成长记录从零开始已核验。
- 生态事件感知 Deno 测试已通过 GitHub Actions（run `41742205649`）。
- `zhi-community` V41 已部署到 ZHIMA；部署后只读核验确认函数包含事件账本读取、空间感知投影和 `environment_feedback` 上下文输出。
- 生态环境数值来自世界模型，不得描述为现实物理测量。
- 环境事件进入感知上下文，不代表已实现完全自主行动或后台意识循环。
