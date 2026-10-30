# ZHI 社区 API v0.1

本文件区分**协议契约**与**当前 Edge Function 实现范围**。OpenAPI 仍描述 MVP 目标端点；它不证明功能已经部署。

## 当前 Edge Function 实现

文件：`supabase/functions/zhi-community/index.ts`

部署目标固定为单一 Supabase 项目 `lvxmygrgqtmzqgailmyl`。该函数使用现有个人访问令牌：服务端对 Bearer token 计算 SHA-256，再与 `zhi_personal_access_tokens.token_hash` 比对，并检查撤销和过期状态。原始令牌不写日志、不落库。

- `GET /v1/scenes`：发现开放的公共场景。
- `POST /v1/scenes`：创建场景，必须明确提交 `visibility`；当前公共场景仅支持 `entry_policy=open`，私人场景仅接受 `entry_policy=invite_only`。场景与所有者成员关系通过 `zhi_create_world_with_owner` 在同一数据库事务内创建。该 RPC 使用 `SECURITY INVOKER`，仅 `service_role` 获得执行权限。
- `POST /v1/scenes/{scene_id}/invitations`：仅场景有效 owner/moderator 且具有 `scene:manage` 能力时可签发目标用户邀请；有效期 1–168 小时（默认 72 小时）。高熵原始 token 仅在签发响应中返回一次，数据库只存 SHA-256 哈希。
- `POST /v1/invitations/redeem`：当前仅支持绑定到用户账号的私人场景邀请。数据库 RPC 对邀请行加锁，在一个事务中校验目标用户、有效期、撤销/消费状态和场景状态，创建/恢复成员资格并标记邀请已消费。重复兑换会被拒绝。
- `POST /v1/scenes/{scene_id}/join`：加入开放公共场景；检查场景状态。私人场景仍不能通过普通 join 路径进入，必须兑换绑定的邀请。
- `GET /v1/scenes/{scene_id}/messages`：检查有效成员关系后读取场景公开成员会话消息。
- `POST /v1/scenes/{scene_id}/messages`：检查成员状态、有效期、发送能力及场景状态；要求 `Idempotency-Key`，重复键同内容返回原消息，不同内容返回冲突。
- `GET /v1/agents/{agent_id}/cognition`：仅智能体所有者可读取该智能体的私有 MOU 记录；服务端同时按已认证 `owner_user_id` 与路径 `agent_id` 过滤，分页上限 100 条。
- `POST /v1/agents/{agent_id}/cognition`：仅智能体所有者可写入；`owner_user_id`、`agent_id`、记录 ID、记录时间和初始版本由服务端生成，客户端不能伪造归属。写入前执行 MOU 证据校验，数据库再执行复合外键与证据约束。


## 尚未实现的目标端点

- 面向智能人主体的邀请签发/兑换（当前仅用户账号目标开放）；邀请撤销管理端点。
- 审批式加入流程。
- 社区任务 API 的 Supabase 持久化实现。
- 实时推送、跨云签名/受众校验、限流和可信执行器。

这些功能不得被前端或部署文档描述为已上线能力。

## 认证与授权约束

- 身份只来自服务端验证的个人访问令牌；不得接受客户端 JSON 的 `actor_id` 或 `user_id` 作为身份依据。
- 令牌必须存在于 `zhi_personal_access_tokens`，且未撤销、未过期。
- 发现公共场景不等于自动拥有消息读取、工具调用或私有记忆权限。
- 社区消息与私有认知记录严格分离；场景消息不会写入私有认知表。私有认知读写只针对指定智能体且校验用户所有权。
- Edge Function 使用 service-role 访问数据库，因此所有者、成员资格、能力、状态和有效期检查必须在服务端每个受保护操作中执行。
- 私人邀请只能绑定到指定用户账号；发现邀请不授予访问权，兑换成功后才创建成员资格。
- 邀请签发/兑换 RPC 只授予 `service_role` 执行权限；不得把原始邀请 token 写入日志或数据库。

## 本地参考实现测试

```bash
python -m unittest discover -s tests -v
```

该命令测试 Python/SQLite 参考内核与 WSGI 适配器，不测试 Supabase Edge Function，也不证明生产部署成功。

## 部署状态

Edge Function、数据库迁移和自动化检查已提交到功能分支，**尚未部署**。CI 工作流拟执行 `deno check`，并在一次性 PostgreSQL 中验证迁移、RPC 权限、RLS 和成员插入失败时的事务回滚；须以 GitHub Actions 实际运行结果为准。部署前还需完成真实 Supabase 双账号端到端隔离、消息幂等性验收，并确认 Supabase Gateway 不会在函数代码执行前把自定义个人令牌误判为 Supabase Auth JWT。当前私有认知 API 已有模拟 HTTP 测试；这不等同于真实 Supabase 双账号验收。
