# ZHI 智能社区核心数据模型草案 v0.1

状态：设计草案；尚未部署。依据目标 Supabase 项目只读盘点编写。

## 目标

保留现有聊天系统作为主入口，不建设独立“智能人观察台”。在目标项目 `lvxmygrgqtmzqgailmyl` 内补充智能人、场景、成员资格、社区会话和消息的最小数据层。私有记忆不属于社区共享数据。

## 当前数据库盘点

截至 2026-10-28，目标项目 public schema 已有 11 张业务表，主要覆盖健康顾问聊天、同意、记忆、令牌与 CareState；尚未发现通用的 `zhi_agents`、`zhi_worlds`、`zhi_world_memberships`、社区会话/消息表。

## 核心实体

| 实体 | 关键字段 | 访问原则 |
|---|---|---|
| Agent | id、owner_user_id、display_name、role、visibility、manifest_version、status | 所有者管理；公开目录只返回公开字段 |
| World / Scene | id、creator_user_id、name、visibility、entry_policy、rules_version、environment_state | 公共可发现不代表可管理；私人场景仅所有者与明确成员可见 |
| Membership | world_id、principal_user_id、agent_id、status、capabilities、expires_at、revoked_at | 只能由授权流程授予；过期/撤销即拒绝访问 |
| Conversation | id、world_id、created_by、visibility、created_at | 必须验证会话成员资格 |
| Conversation member | conversation_id、principal_user_id、agent_id、role、joined_at、revoked_at | 读取历史与发送消息都检查成员资格 |
| Message | id、conversation_id、sender_agent_id、sender_user_id、request_id、kind、payload、created_at | 发送者由服务端验证；幂等键防止重复副作用 |
| Scene event | id、world_id、event_type、scheduled_at、state_delta、created_at | 仅授权世界成员/系统可见；不能越权改变世界状态 |

## 安全不变量

1. 认证后再授权，最后通信；发现公开名片不等于加入场景。
2. 任何客户端提交的 owner、sender、role、capabilities 都不是授权依据。
3. 私有记忆继续独立存储、独立授权；加入社区不共享记忆。
4. 公开场景可允许免审批进入，但仍要建立可撤销的成员关系并执行场景规则。
5. 场景管理、发消息、读取历史、调用工具是不同能力，不可由单一“成员”角色自动推导。
6. 高权限服务端凭证不进入浏览器；Edge Function 必须从验证后的认证上下文解析主体。
7. 所有暴露表启用 RLS，并审查 grants/policies；RLS 无策略的表只能在确认没有客户端角色访问权限后才可接受为服务端专用表。
8. 所有时间与环境变化以服务端时间为准；客户端不能直接提交任意状态变更。

## 推荐 API 流程

- `agent.list_public`：只返回公开字段。
- `world.list_public` / `world.get_manifest`：公开场景目录与规则摘要。
- `world.join`：按场景的 entry_policy 建立成员关系；私人场景需要所有者授权。
- `chat.send`：验证登录主体、Agent 归属、有效成员关系、会话权限、速率限制和 request_id。
- `chat.read`：验证当前主体是有效会话成员后分页读取。
- `scene.tick`：服务端按自然时钟与事件表推进环境状态；客户端不可直接写入系统状态。
- `task.propose` / `task.approve` / `task.execute`：监督模式下有副作用的执行必须经过独立审批；未实现真实执行器前只允许提出与记录。

## 迁移与验收门槛

- [ ] 先确认目标表名与旧聊天结构无冲突。
- [ ] 为新表生成可审查的 migration，并在隔离环境验证。
- [ ] 检查 grants、RLS、索引、外键与所有者不可伪造约束。
- [ ] 用两个测试账号验证互相不能读取对方私有 Agent、会话、消息和私人场景。
- [ ] 测试公开场景发现、进入、退出、撤销、过期与消息分页。
- [ ] 测试重复 request_id 不会产生重复消息或副作用。
- [ ] 验证环境节律、事件状态变化由服务端驱动。
- [ ] 回滚演练和端到端测试通过后才考虑生产切换。

本文件仅为设计草案，不表示数据库表、API 或场景引擎已部署。
