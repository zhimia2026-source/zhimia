# ZHI 社区 API v0.1

本文件区分**协议契约**与**当前 Edge Function 实现范围**。`openapi/zhi-community-v0.1.yaml` 已补齐当前智能人、私有认知、反馈、提案、审批、回滚及邀请路由；OpenAPI 契约不证明功能已经部署。

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
- `POST /v1/agents/{agent_id}/cognition/{record_id}/feedback`：仅智能体所有者可针对其私有假设追加反馈；服务端验证假设归属、假设类型与预测字段，并生成新的 `feedback` 观察记录。反馈不会覆盖原假设，来源、事件时间、记录时间和置信度均保留。
- `GET /v1/agents/{agent_id}/cognition/proposals`：列出该智能人的私有认知修订提案，最多 100 条。
- `POST /v1/agents/{agent_id}/cognition/{record_id}/proposals`：根据该智能人当前拥有的基础记录、1–20 条反馈记录和候选状态创建持久化提案。数据库事务再次校验基础记录与反馈记录的 owner/agent 归属及关联关系；提案状态固定为 `shadow_proposed`，必须人工审核，不会自动修改认知记录。
- `POST /v1/agents/{agent_id}/cognition/proposals/{proposal_id}/decision`：仅智能人所有者可批准或拒绝提案。批准时数据库锁定智能人并检查基础版本仍为最新版本；通过后追加 `approved_revision` 新记录，过期提案标记为 `stale`，不覆盖旧记录。
- `POST /v1/agents/{agent_id}/cognition/rollback`：仅所有者可指定同一智能人较早的认知记录作为恢复目标；数据库追加一个 `rollback` 新版本，保留被回滚版本及中间历史。回滚说明写入新版本的 `change_note`，不只在响应中返回。\n- `change_note`：批准修订与回滚的人类决策说明随追加版本持久保存；旧版本仍不可变。该列由迁移 `20261030190000_zhi_cognition_change_note_audit.sql` 添加。


- `GET /v1/agents`：列出当前认证用户拥有的智能人（最多 100 个）。
- `POST /v1/agents`：创建管理型智能人（默认角色 `manager`、默认私有）；所有者由认证令牌确定，客户端不能指定其他用户为 owner。

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

Edge Function、数据库迁移、聊天页面和自动化检查已提交到功能分支，**尚未部署**。

- GitHub Actions run [41031915086](https://github.com/zhimia2026-source/zhimia/actions/runs/41031915086)，代码提交 `c127ddd828a22feb40b42dd44d111ab5b2eeba46`，通过：
  - Edge Function 类型检查与全部 HTTP/helper 测试，包括私有聊天上下文隔离测试。
  - 六项数据库迁移在一次性 PostgreSQL 中应用成功（社区核心、私有认知、认知提案、审批/回滚、变更说明审计、私有聊天）。
  - 私有聊天表 RLS、浏览器角色权限、复合 owner/agent 外键及幂等键唯一性 SQL 检查。
  - OpenAPI 与 CI workflow YAML 语法检查。
- 聊天路由测试使用 mock 数据库和 mock 模型提供方；不代表真实模型服务连通，也不代表真实 Supabase 双账号 HTTP E2E 已通过。
- GitHub Pages 工作流已配置在未来合并到 `main` 后发布 `chat.html`；当前分支上的页面不是已发布页面。
- 生产 Supabase 项目尚未执行这些迁移，也没有部署新的 `zhi-community` Edge Function。启用聊天前还需在服务端配置 `ZHI_CHAT_API_URL`、`ZHI_CHAT_API_KEY`、`ZHI_CHAT_MODEL`，并完成真实提供方连通性测试。
- 部署前仍需完成真实 Supabase 双账号隔离、令牌撤销/过期、并发幂等、模型超时和回滚验收，并确认 Supabase Gateway 对自定义个人令牌的配置正确。

### 版本审计字段

认知记录读取接口返回 `change_kind`、`previous_record_id`、`source_proposal_id` 与 `change_note`，用于追踪追加式版本链及人类决策说明。

## Private intelligent-person chat

- `GET /v1/agents/{agent_id}/chat?limit=50`: reads the authenticated owner's private chat turns for that exact agent. The limit is 1–100.
- `POST /v1/agents/{agent_id}/chat`: accepts `{"message":"..."}` and requires an `Idempotency-Key` header. The server verifies ownership and active status before reading private cognition or chat history.
- Model provider configuration is server-side only: `ZHI_CHAT_API_URL`, `ZHI_CHAT_API_KEY`, and `ZHI_CHAT_MODEL`. The provider URL must use HTTPS. If these secrets are absent, the endpoint returns `503 chat_model_not_configured`; no fake reply is generated.
- Context assembly is server-side and limited to the authenticated `owner_user_id` + requested `agent_id`: the agent profile, up to 20 private cognition records, and up to 12 completed private chat turns. Scene messages are not queried or included.
- The conversation is persisted in `zhi_agent_chat_turns`, which has a composite owner/agent foreign key and a unique owner/agent/idempotency-key constraint. It is not stored in `zhi_world_messages`.
- A failed model request marks the turn as failed and returns `502 chat_generation_failed`. Retrying the same idempotency key returns a conflict; clients should send a new key for a new attempt.
- Chat content does not automatically create or update long-term cognition. The supervised feedback/proposal/approval workflow remains separate.

The new chat UI is `web/zhi-agent-chat.html`. It is a branch artifact, not a deployed page. It uses the existing personal access token model and stores the token only in browser `sessionStorage`. It does not restore the old shared-password gate, global broadcast, old Core database, or old Agnes endpoints.

**Release limitation:** the endpoint requires the new private-chat migration and the three provider secrets. The current CI uses a mocked model provider and disposable PostgreSQL; real provider connectivity and real two-account Supabase HTTP E2E remain outstanding.

