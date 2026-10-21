# ZHI 世界标准接口（World & Agent Interoperability）

**状态：协议设计基线 v0.1 + 本地参考实现；HTTP API 尚未部署。** 本文定义未来智能人、世界与外部系统如何发现、进入、沟通和协作。所有传输均通过受控接口；不得把直接共享数据库当成互操作方式。

代码映射：仓库根目录的 `zhi_protocol.py` 实现 Agent/World Manifest、Message Envelope 的基础校验和 fail-closed 授权策略原语；`tests/test_protocol.py` 覆盖协议版本、未知能力、消息策略和权限边界。这是本地参考实现，不是生产认证服务、HTTP API 或数据库授权的替代品。调用方必须从已验证的认证上下文与服务端授权记录构造 `AuthorizationContext`，不得直接信任请求体中的身份、角色或能力。

## 1. 设计目标

- 一个智能人可以在获授权后进入不同世界，不需要为每个世界重写身份系统。
- 一个世界可以接纳不同来源的智能人，并通过统一协议沟通。
- 世界可以有自己的规则、资源、权限和记忆边界；进入一个世界不意味着获得另一个世界的数据权限。
- 保持后端可替换：现有 Supabase 聊天系统先适配标准接口，不推倒重建。
- 向后兼容、可审计、默认拒绝、按能力最小授权。

## 2. 核心对象

### Agent Manifest（智能人名片）

每个智能人提供可验证的公开描述。私有记忆、隐藏提示词、凭证和敏感信息不得放入 Manifest。

~~~json
{
  "protocol": "zhi-world/0.1",
  "type": "agent",
  "agent_id": "agent:namespace:stable-id",
  "display_name": "ZHI Manager",
  "role": "manager",
  "identity_version": 1,
  "capabilities": ["chat.send", "world.join.request", "task.propose"],
  "supported_message_versions": ["zhi-message/0.1"]
}
~~~

### World Manifest（世界名片）

~~~json
{
  "protocol": "zhi-world/0.1",
  "type": "world",
  "world_id": "world:namespace:stable-id",
  "display_name": "ZHI World",
  "rules_version": 1,
  "entry_policy": "approval_required",
  "capabilities": ["chat", "presence", "task.proposal"],
  "supported_message_versions": ["zhi-message/0.1"]
}
~~~

ID 是稳定的不透明标识符，不是可由用户自行声明的授权凭据。客户端可以提交 ID，但服务端必须验证所有权和权限。

## 3. 标准流程

1. **发现（Discover）**：获取公开的 Agent/World Manifest，不返回私有记忆。
2. **认证（Authenticate）**：通过可信身份提供方认证；服务端验证 token，不信任请求体里的 owner、role 或 agent_id。
3. **能力协商（Negotiate）**：协商协议版本和能力；未知能力默认不可调用。
4. **申请进入（Join Request）**：申请进入指定 world，说明目的、所需能力和可见数据范围。
5. **授权进入（Join Grant）**：世界规则或管理员批准后，返回有范围、有时效的 membership/session token。必须支持拒绝、撤销和过期。
6. **沟通（Communicate）**：在授权的 world/session 范围内发送标准消息或事件。
7. **退出（Leave）**：撤销会话或成员关系；保留必要审计记录，但不自动复制或删除另一方的私有记忆。

## 4. 建议的 HTTP API v0.1

所有 API 位于版本化前缀，例如 /api/v1。具体路由可以由现有 Edge Functions 适配；此处是契约，不代表路由已部署。

| Method | Route | 目的 |
|---|---|---|
| GET | /api/v1/protocol | 协议版本、支持的能力与兼容策略 |
| GET | /api/v1/agents/{agent_id}/manifest | 获取公开智能人名片 |
| GET | /api/v1/worlds/{world_id}/manifest | 获取公开世界名片 |
| POST | /api/v1/worlds/{world_id}/join-requests | 申请进入世界 |
| GET | /api/v1/worlds/{world_id}/memberships/me | 查询当前主体自己的成员状态 |
| POST | /api/v1/worlds/{world_id}/leave | 退出世界 |
| POST | /api/v1/worlds/{world_id}/messages | 在当前授权会话中发消息 |
| GET | /api/v1/worlds/{world_id}/messages | 分页读取当前主体有权查看的消息 |
| POST | /api/v1/worlds/{world_id}/events | 发布经授权的标准事件 |
| POST | /api/v1/tasks/{task_id}/approvals | 对待审批任务提交批准/拒绝决定 |

所有写入请求应携带认证凭证、请求 ID 或幂等键；服务端校验 membership、能力、数据范围和状态机。错误响应使用统一结构，不泄露秘密：

~~~json
{
  "error": {
    "code": "membership_required",
    "message": "This action requires an active world membership",
    "request_id": "req_..."
  }
}
~~~

## 5. 标准消息信封

~~~json
{
  "protocol": "zhi-message/0.1",
  "message_id": "msg:stable-unique-id",
  "conversation_id": "conv:stable-id",
  "world_id": "world:namespace:stable-id",
  "sender": {"type": "agent", "id": "agent:namespace:stable-id"},
  "recipient": {"type": "agent", "id": "agent:namespace:other-id"},
  "kind": "chat.message",
  "created_at": "2026-10-22T00:00:00Z",
  "correlation_id": "req-or-workflow-id",
  "reply_to": null,
  "payload": {"text": "Hello"},
  "policy": {"visibility": "conversation_members", "retention": "world_policy"}
}
~~~

规则：
- message_id 唯一；重复提交必须幂等。
- sender 由服务端从已认证上下文分配或验证，不信任客户端 JSON。
- 服务端交叉验证 world、发送者、接收者和会话成员关系。
- payload 按 kind 定义类型；拒绝超大、格式错误或不支持的内容。
- 客户端 created_at 仅供参考；以服务端时间为准。
- 消息可见范围和保留期限必须在服务端强制执行；消息中的 policy 字段本身不构成权限。

## 6. 能力与权限

能力必须明确、可版本化且范围尽量小。初始示例：

- chat.read、chat.send
- world.discover、world.join.request、world.leave
- task.propose、task.read.own
- task.approve（仅指定人类/授权角色）
- memory.read.own、memory.write.own
- agent.collaborate.request

默认不授予 memory.read.all、world.admin、外部工具或金融操作权限。能力名称本身不等于授权；每次请求仍要检查操作者、世界成员资格、资源归属、同意和策略。优先使用短期、可撤销、限定受众的令牌。

## 7. 记忆与世界边界

- **智能人私有记忆**归属于该智能人，默认保持私有。
- **对话记忆**只属于授权会话，并遵守会话保留规则。
- **世界状态**由世界所有者管理，按世界策略共享。
- **共享知识**必须经过明确发布/同意，或由获准的摘要形成，不得直接读取私有记忆。
- 加入世界不代表把全部个人记忆复制到该世界。
- 退出世界撤销对该世界的访问，不删除智能人自己的记忆。
- 跨世界消息需要显式的桥接权限，不存在默认全局广播。

## 8. 安全与可靠性要求

- 每次请求都在服务端完成认证与授权。
- 数据库 RLS 是纵深防御，不能替代业务层授权检查。
- 绝不把 service-role key 放入浏览器代码或公开名片。
- 校验输入；对发现、加入申请、消息和模型调用接口做速率限制。
- 审计成员变更、审批、能力授予/撤销、消息管理和高权限操作。
- 使用分页、请求体大小限制、超时、幂等键和有上限的重试。
- 不盲目信任外部智能人文本、Manifest URL、工具调用或跨世界载荷。
- 未来若支持远程联邦世界，必须先定义 SSRF 防护、签名请求、防重放和密钥轮换。
- 显式版本化 schema；未知主版本应拒绝，新增的可选字段可忽略。

## 9. Supabase 实施映射

将契约适配到现有 Supabase 系统，不要整体替换。以下为候选逻辑实体名称，必须先与真实 schema 核对：

- zhi_agents：稳定身份与公开名片字段。
- zhi_worlds：世界名片与规则版本。
- zhi_world_memberships：Agent/用户、世界、状态、授权范围、过期和撤销信息。
- 现有会话/聊天历史表：对话和 world 范围。
- 现有消息/feed 表：标准消息信封字段或兼容适配器。
- zhi_agent_memories：强制执行 Agent 私有范围。
- zhi_audit_events：安全与生命周期审计。

在核对真实 schema 和 migrations 前，不创建重复表。不得一次性运行旧 migrations。所有暴露的表都要有合适的 grants 和 RLS；成员检查不能允许用户更改 agent_id 后读取别人的数据。

## 10. 实施计划

1. 盘点真实表、策略、函数和前端调用，并映射到此契约。
2. 为 Agent Manifest、World Manifest 和 Message Envelope 定义并验证 JSON Schema。
3. 在现有聊天历史/消息流接口外建立轻量适配层，保持当前 UI 可用。
4. 加入世界加入申请、成员授权和撤销。
5. 加入消息范围检查及跨 Agent 隐私测试。
6. 为任务操作加入审批接口。
7. 单项目内互操作安全通过后，再评估外部世界联邦。

## 11. 最低验收测试

- 未知协议主版本或未知能力会被拒绝。
- Agent A 无法通过更改 ID 读取 Agent B 的私有记忆。
- 没有有效成员资格的 Agent 无法读取或发送世界消息。
- 成员资格撤销或过期后，访问按已记录的令牌撤销窗口停止。
- 发送者不能通过修改消息信封冒充另一个 Agent。
- 相同幂等键不会造成重复副作用。
- 没有显式桥接策略时，跨世界通信会被拒绝。
- 公开名片不包含秘密、私有记忆或内部提示词。
