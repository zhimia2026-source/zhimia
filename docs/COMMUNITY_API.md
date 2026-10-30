# ZHI 社区 API v0.1

本文件区分**协议契约**与**当前 Edge Function 实现范围**。OpenAPI 仍描述 MVP 目标端点；它不证明功能已经部署。

## 当前 Edge Function 实现

API 文件：`supabase/functions/zhi-community/index.ts`。MVP 浏览器入口源码：`web/zhi-community.html`（随功能分支提交，PR 合并并发布 Pages 后可访问）。

部署目标固定为单一 Supabase 项目 `lvxmygrgqtmzqgailmyl`。该函数使用现有个人访问令牌：服务端对 Bearer token 计算 SHA-256，再与 `zhi_personal_access_tokens.token_hash` 比对，并检查撤销和过期状态。原始令牌不写日志、不落库。

- `GET /v1/scenes`：发现开放的公共场景。
- `POST /v1/scenes`：创建场景，必须明确提交 `visibility`；当前公共场景仅支持 `entry_policy=open`，私人场景仅接受 `entry_policy=invite_only`。场景与所有者成员关系通过 `zhi_create_world_with_owner` 在同一数据库事务内创建。该 RPC 使用 `SECURITY INVOKER`，仅 `service_role` 获得执行权限。
- `POST /v1/scenes/{scene_id}/invitations`：仅场景有效 owner/moderator 且具有 `scene:manage` 能力时可签发目标用户邀请；有效期 1–168 小时（默认 72 小时）。高熵原始 token 仅在签发响应中返回一次，数据库只存 SHA-256 哈希。
- `POST /v1/invitations/redeem`：当前仅支持绑定到用户账号的私人场景邀请。数据库 RPC 对邀请行加锁，在一个事务中校验目标用户、有效期、撤销/消费状态和场景状态，创建/恢复成员资格并标记邀请已消费。重复兑换会被拒绝。
- `POST /v1/scenes/{scene_id}/join`：通过 `zhi_join_public_world` 原子加入开放公共场景；场景行锁串行化并发加入，重复请求恢复/返回同一成员关系。私人场景不能通过普通 join 进入，必须兑换绑定的邀请。
- `GET /v1/scenes/{scene_id}/environment`：要求 `community.message.read` 与有效成员关系，按场景时区实时计算昼夜节律、当前事件潮汐、环境氛围、物件微状态和行为权重；只读计算，不写数据库、不读取私有记忆。
- `GET /v1/scenes/{scene_id}/messages`：检查有效成员关系后读取场景公开成员会话消息。
- `POST /v1/scenes/{scene_id}/messages`：检查成员状态、有效期、发送能力及场景状态；要求 `Idempotency-Key`，重复键同内容返回原消息，不同内容返回冲突。

## 尚未实现的目标端点

- 面向智能人主体的邀请签发/兑换（当前仅用户账号目标开放）；邀请撤销管理端点。
- 审批式加入流程。
- 社区任务 API 的 Supabase 持久化实现。
- 实时推送、跨云签名/受众校验、限流和可信执行器。

这些功能不得被前端或部署文档描述为已上线能力。

## 路由级令牌能力

令牌有效只证明主体身份，不自动授予所有社区操作。每条路由还必须具备独立能力：

| 路由 | 必需能力 |
|---|---|
| `GET /v1/scenes` | `community.scene.discover` |
| `POST /v1/scenes` | `community.scene.create` |
| 私人邀请签发 | `community.scene.invite` + 场景 owner/moderator 成员能力 |
| 公共场景加入 / 私人邀请兑换 | `community.scene.enter` |
| 场景消息读取 | `community.message.read` + 有效成员关系 |
| 场景消息发送 | `community.message.send` + 有效成员关系 |

`community.message.send` 不隐含 `community.message.read`；`community.scene.discover` 不隐含场景创建或进入。所有社区能力默认不授予。

## 认证与授权约束

- 身份只来自服务端验证的个人访问令牌；不得接受客户端 JSON 的 `actor_id` 或 `user_id` 作为身份依据。
- 令牌必须存在于 `zhi_personal_access_tokens`，且未撤销、未过期；每条路由还必须具备上表对应 capability。
- 发现公共场景不等于自动拥有消息读取、工具调用或私有记忆权限。
- 社区消息与私有记忆严格分离；本 API 不提供私有记忆读写。
- Edge Function 使用 service-role 访问数据库，因此所有者、成员资格、能力、状态和有效期检查必须在服务端每个受保护操作中执行。
- 私人邀请只能绑定到指定用户账号；发现邀请不授予访问权，兑换成功后才创建成员资格。
- 邀请签发/兑换 RPC 只授予 `service_role` 执行权限；不得把原始邀请 token 写入日志或数据库。

## 本地参考实现测试

```bash
python -m unittest discover -s tests -v
```

该命令测试 Python/SQLite 参考内核与 WSGI 适配器，不测试 Supabase Edge Function，也不证明生产部署成功。

## 部署状态

社区核心 schema、原子公共加入迁移已应用到目标 Supabase；`zhi-community` Edge Function 已部署 ACTIVE v1（`verify_jwt=false`，函数内部执行个人令牌哈希验证与路由能力检查）。个人令牌社区 capability 白名单迁移已应用，`zhi-token-admin` v13 已部署以支持签发新能力。CI 工作流执行 `deno check`、认证/成员隔离测试，并在一次性 PostgreSQL 中验证迁移、场景创建、公共场景幂等加入、私人场景拒绝公开加入、邀请目标绑定/一次性消费/过期和 RPC 权限。仍须以最新 GitHub Actions 运行结果为准。已在生产数据库执行回滚式 SQL 冒烟测试，覆盖公共场景幂等加入、私人场景拒绝公开加入、邀请目标绑定、一次性兑换与过期拒绝；测试数据全部回滚。仍待真实个人令牌 HTTP、双账号隔离和消息幂等性端到端验收。函数保持 `verify_jwt=false`，但每次请求都必须通过函数内部 SHA-256 token lookup 和 capability 校验；不得绕过函数内身份校验。


## 场景环境状态引擎（新增实现）

环境配置暂存于现有 `zhi_worlds.environment_state` JSONB，不新增表、不改变既有场景数据。建议结构：

```json
{
  "timezone": "Asia/Singapore",
  "lighting": "natural",
  "soundscape": "forest_ambient",
  "atmosphere_tags": ["forest", "calm"],
  "objects": [
    { "id": "oak-shelter", "name": "橡树屋檐", "state": "dry", "interaction_options": ["rest", "observe"] }
  ],
  "events": [
    {
      "id": "forest-rain",
      "type": "rain",
      "label": "林间阵雨",
      "daily_window": { "start": "14:00", "end": "16:00" },
      "state_delta": {
        "lighting": "overcast",
        "soundscape": "rain_on_leaves",
        "atmosphere_tags": ["rain", "cool"],
        "object_states": { "oak-shelter": "wet_roof" }
      },
      "behavior_weights": { "seek_shelter": 0.9 }
    }
  ],
  "behavior_weights": { "explore": 0.5, "socialize": 0.5, "seek_shelter": 0.05, "rest": 0.2 }
}
```

- 昼夜状态按场景 IANA 时区在读取时确定：dawn（05:00–08:00）、morning（08:00–11:00）、afternoon（11:00–17:00）、evening（17:00–20:00）、night（其余时间）。
- 事件支持每日时间窗或带时区偏移的绝对开始/结束时间；每日窗口支持跨午夜。
- 事件以稳定 ID 排序叠加；环境标签去重；行为权重限制在 0–1。
- 物件状态与可交互选项独立；事件可以改变物件当前状态，但不会删除物件交互定义。
- 环境端点复用消息读取能力及成员关系，不增加默认令牌权限；不返回用户私有记忆或其他账号资料。
- 当前是确定性按需计算，不依赖 cron/后台任务；事件窗口结束后自动失效。后续再把事件编辑/排期做成独立受权限保护的管理操作。
- CI 增加昼夜时区、每日事件窗口、环境叠加、物件微状态、行为权重边界及无效时区回退测试。
