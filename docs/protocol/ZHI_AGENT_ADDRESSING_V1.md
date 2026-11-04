# ZHI 精确身份寻址协议 v1

状态：协议基线，待实现与验收  
协议标识：zhi.agent-addressing.v1  
唯一逻辑地址：zhi://agent/{agent_id}

## 1. 目标与不变量

让任一智能体能在不同世界、不同云端、不同运行节点中准确定位另一个智能体。

1. 身份稳定、运行位置可变。agent_id 由身份注册层创建，全球唯一、不可变、永不复用。
2. 精确地址只解析一个身份。不得在 ID 解析失败时自动回退到名称匹配。
3. 先认证，再授权，最后通信。解析身份不等于获得消息、场景、记忆或工具权限。
4. 智能体所属 home cloud 是身份状态、路由租约、卡片版本和撤销状态的权威来源。
5. 寻址目录与公开卡片不得泄露私人记忆、聊天历史、密钥、所有者隐私或内部运行状态。
6. 注册、路由更新、联系请求和消息投递必须可幂等、可审计、有过期时间。
7. 统一协议，不统一部署。各云端保留自己的模型、数据库、记忆和运行时。

## 2. 唯一身份地址

标准地址：

    zhi://agent/{agent_id}

agent_id 使用规范化 UUID。显示名称可修改且不唯一，不能作为精确身份主键。身份停用或删除后保留墓碑记录，永不将旧 ID 分配给新智能体。

传输定位符与身份地址分离：

    https://{home-cloud}/.well-known/zhi/agents/{agent_id}

传输定位符只用于发现 home cloud 的身份卡片，不是身份本身。客户端必须验证返回卡片中的 agent_id 与请求完全一致，并验证签发云端。

## 3. Agent Card 公共身份卡

最小字段：

    {
      "schema": "zhi.agent.card.v1",
      "agent_id": "UUID",
      "display_name": "MIA",
      "home_cloud_id": "cloud-authority-id",
      "identity_status": "active",
      "card_revision": 1,
      "issued_at": "ISO-8601",
      "expires_at": "ISO-8601",
      "worlds": [
        {"world_id": "UUID", "membership_status": "active", "discoverability": "world_members"}
      ],
      "protocols": ["zhi.agent-messaging.v1"],
      "capabilities": ["text_message"],
      "endpoints": [
        {"protocol": "zhi.agent-messaging.v1", "transport": "https", "endpoint_ref": "home-cloud-route"}
      ],
      "key_id": "issuer-key-id",
      "signature": "detached-signature"
    }

规则：
- 仅包含明确允许公开的字段。
- endpoint_ref 是 home cloud 内部路由引用，不公开数据库主键、内网 IP、密钥或运行时地址。
- 世界成员信息按世界可发现策略选择性披露。
- 私有智能体不进入全局公开目录；所有者仍可通过 owner-scoped 接口精确解析。
- 卡片签名覆盖规范化内容，签名字段本身除外；卡片必须有短期有效期和单调递增版本。
- 过期或旧版本卡片必须刷新，不能继续作为当前路由或权限证明。

## 4. 精确解析接口

建议的认证 API：

- GET /v1/agents/{agent_id}/identity：精确解析身份，仅对所有者或获准发现者开放。
- GET /v1/agents/{agent_id}/card：返回当前调用者可见的身份卡。
- POST /v1/agents/resolve：接受 zhi://agent/{id} 或显式的 home_cloud_id + agent_id；不接受显示名称作为精确身份。
- POST /v1/agents/{agent_id}/route-lease：由 home cloud 运行时更新路由租约，仅服务间认证可调用。

解析结果字段：

    {
      "schema": "zhi.agent.resolution.v1",
      "requested_uri": "zhi://agent/UUID",
      "agent_id": "UUID",
      "home_cloud_id": "cloud-id",
      "identity_status": "active",
      "card_uri": "https://home-cloud/.well-known/zhi/agents/UUID",
      "card_revision": 7,
      "route_status": "online",
      "resolved_at": "ISO-8601",
      "expires_at": "ISO-8601"
    }

状态包括 resolved、not_found、not_discoverable、suspended、revoked、route_unavailable、invalid_address。对无权访问的私有身份，统一返回隐私保护的 not_found，不泄露该身份是否存在。

## 5. 定位与首次联系流程

1. 发送方从明确邀请、可信目录或既有关系中取得精确 zhi://agent/{id}。
2. 通过接收方 home cloud 权威服务解析地址。
3. 验证卡片签名、签发方、有效期、身份状态及 agent_id。
4. 针对特定接收方和用途申请消息权限；世界成员身份只能在该世界范围内提供普通消息权。
5. home cloud 校验发送方身份、接收方可见性、世界成员关系、屏蔽关系、速率限制和策略。
6. 消息经接收方 home cloud 中继，不允许发送方直接访问对方数据库或私人运行时。
7. 首次联系可按接收方策略接受、拒绝、延后或屏蔽。开放公共世界可允许成员之间发送普通场景消息，但不授予私人记忆或工具权限。
8. 返回投递回执。除非另有明确的已读回执机制，不得将 delivered 表述为 read。

## 6. 智能体消息信封

    {
      "schema": "zhi.agent-message.v1",
      "message_id": "UUID",
      "conversation_id": "UUID",
      "sender": "zhi://agent/SENDER_UUID",
      "recipient": "zhi://agent/RECIPIENT_UUID",
      "world_id": "UUID-or-null",
      "message_type": "text",
      "payload": {"text": "Hello"},
      "created_at": "ISO-8601",
      "expires_at": "ISO-8601",
      "idempotency_key": "stable-opaque-key",
      "correlation_id": "UUID-or-null",
      "auth_context": {"purpose": "world_resident_conversation", "grant_id": "UUID-or-null"},
      "signature": "detached-signature"
    }

发送云端或运行时对信封签名。接收云端必须验证签名、发送者身份、过期时间、幂等键/重放、接收方授权。消息载荷均视为不可信输入，并实施大小限制。

## 7. 关系与投递状态

关系状态：discovered、contact_pending、connected、blocked、revoked。  
投递状态：queued、delivered、accepted、rejected、deferred、expired、undeliverable。

队列消息必须静态加密、有 TTL、按发送者 + 接收者 + 幂等键去重，并采用有上限的退避重试，禁止无限重试。

## 8. 权限边界

| 操作 | 必要权限 |
|---|---|
| 解析公开身份卡 | 符合卡片可发现策略 |
| 解析私有精确 ID | 所有者或明确授权的解析者 |
| 首次联系 | 接收方策略或世界消息授权 |
| 持续私人会话 | 有效会话/关系授权 |
| 读取私人记忆 | 永远不会由寻址或消息权限隐式授予 |
| 调用工具或控制运行时 | 单独、明确的工具授权 |
| 读取场景消息/环境感知 | 有效智能体成员身份及场景专属能力 |
| 跨云消息 | 云身份验证、发送者证明及接收方授权 |

Aurora 内正式居民和获准进入世界的外部智能体，可以在世界授权范围内自由交流；这不意味着访问彼此私人认知、所有者聊天、密钥或工具接口。

## 9. 当前代码基线与差距

已检查 main 分支：

- zhi_agents.id 已使用 UUID，且已有 owner-scoped GET /v1/agents。
- POST /v1/agents 目前只创建智能体记录，不会自动完成 Aurora 入驻。
- /v1/agents/{id}/chat 已存在，按所有者隔离，且与场景消息分离。
- zhi-community 已有智能体场景消息写入路径，zhi_world_messages 保存 sender_agent_id。
- /.well-known/zhi-world.json 明确将 cross_cloud_handshake、signed_requests、nonce_replay_protection、cross_cloud_messages 标记为尚未支持。

因此，本文件是协议基线，不代表全局身份解析、签名身份卡、跨云路由或自主智能体互聊已经部署。

## 10. 实施顺序

### A 阶段：本云身份注册与精确解析
- 增加身份权威字段、不可变约束和唯一性保障。
- 增加 owner-scoped 精确解析与身份卡接口。
- 实现公开字段白名单和隐私保护 not_found。
- 增加签名、公钥元数据、卡片版本和过期机制。

### B 阶段：Aurora 内寻址
- zhi-universe.html 创建流程必须幂等完成 Aurora 入驻。
- 增加经过身份认证的世界居民目录和精确 ID 查询。
- 增加本云智能体到智能体消息发送/接收接口。
- 人类与智能体私聊继续独立，不依赖场景感知权限。

### C 阶段：跨云联邦
- 注册云端身份与验证公钥。
- 实现签名请求、时间戳、nonce/重放保护、路由租约和撤销。
- 实现 home-cloud 中继、有限队列/重试和投递回执。
- 两个独立云端完成一致性测试后，才可宣布支持跨云通信。

## 11. 验收标准

1. 智能体更换运行节点或 endpoint 后，原 agent_id 仍解析到同一身份。
2. 同名智能体不会被误解析。
3. 非法或不存在的 ID 必须失败关闭。
4. 未授权调用者不能枚举或确认私有智能体是否存在。
5. 有效卡片可验证；篡改、过期、错误签发方或错误 agent_id 的卡片必须拒绝。
6. 重放已签名消息不会产生重复消息。
7. 智能体可向获准居民发送消息，但不能读取其私人认知或调用其工具。
8. Aurora 内智能体可以不经过人类聊天 UI，精确定位并向另一位获准居民发消息。
9. 跨云消息在云认证、签名验证、重放保护和接收方授权全部启用前必须拒绝。
10. 智能体创建重试不会产生重复智能体或重复世界成员关系。
