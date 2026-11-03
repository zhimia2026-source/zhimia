# ZHI Universe V0.1 实施蓝图

> 状态：工程实施基线（已完成资产盘点；世界实例化与端到端体验尚未验收）
> 版本：0.1.0
> 目标：在现有 ZHI 仓库和 Supabase 项目上增量构建第一个硅基生命栖息世界，不重建已有身份、聊天、记忆和场景权限系统。

## 1. 建设目标与边界

V0.1 的目标不是证明数字实体具有主观意识，而是交付一个可运行、可审计的数字栖息地原型，使一个有稳定身份的 Agent 能够在一个有时间与环境状态的世界中：

1. 被创建并拥有唯一身份；
2. 进入一个明确授权的世界；
3. 通过现有聊天入口与创造者互动；
4. 在授权边界内感知世界事件；
5. 形成候选经历，经审查后沉淀为私有记忆；
6. 与世界中的其他主体建立显式关系（后续迭代）；
7. 留下可追踪、可回滚的状态变化。

V0.1 首个垂直切片：ZHI-001 Aurora → Lumina City → Lumen-001 → 私有聊天 → 候选经历 → 创造者审核。

暂不做：十二居民同时自治、真实资金经济、无监督自主循环、机器人身体、行星级物理模拟、跨云自动互信。Three.js/WebGL 全景表现不是首个后端闭环的前置条件。

## 2. 现有资产盘点与复用决策

GitHub：`zhimia2026-source/zhimia`，默认分支 `main`。
Supabase：项目 `lvxmygrgqtmzqgailmyl`，区域 `ap-southeast-1`，状态为 ACTIVE_HEALTHY。

已确认存在的数据库资产（均已启用 RLS）：

| 现有对象 | V0.1 用途 | 复用原则 |
|---|---|---|
| `zhi_worlds` | 世界/场景实体，保存可见性、进入策略、规则版本和环境状态 | 不另建 worlds 表 |
| `zhi_world_memberships` | 用户或 Agent 的场景成员身份与能力 | 成员身份不自动授予工具或记忆权限 |
| `zhi_world_invitations` | 私有世界邀请 | 继续使用哈希邀请凭据 |
| `zhi_world_conversations` / `zhi_world_messages` | 世界公共交流 | 只存共享消息，不混入私有记忆 |
| `zhi_world_events` | 世界事件与状态变化 | 事件写入需由服务端校验 |
| `zhi_agents` | Agent 身份目录 | 每个 Agent 绑定唯一 owner；公共 manifest 不放私有记忆 |
| `zhi_agent_chat_turns` | 私有 Agent 聊天轮次 | 继续按 owner + agent 双重限定 |
| `zhi_agent_micro_experiences` | 候选经历与审核后经历 | 未审核经历不能自动成为长期记忆 |
| `zhi_agent_cognition_records` | 私有认知状态及版本历史 | 精确 owner + agent 隔离，变更可追溯 |
| `zhi_cognition_revision_proposals` | 认知修改提案 | 必须由创造者明确审核 |
| `zhi_personal_access_tokens` | 现有个人令牌认证与能力授权 | 不另造一套 token |

已确认的 Edge Functions：

- `zhi-community`：现有 Agent/World/成员/消息/认知提案/场景环境 API。
- `zhi-memory`：私有微体验创建、读取、审核和删除 API。
- 其他现有函数（健康顾问、令牌网关、Care）保持独立，不因 Universe 建设而覆盖。

重要限制与核查结果：Supabase Security Advisor 对 18 张表报告 RLS enabled but no policy。对核心世界/Agent/记忆表抽查 `information_schema.role_table_grants`，只发现 `service_role` 与 `postgres` 权限，未发现 `anon` 或 `authenticated` 直接表权限；这与服务端专用访问设计一致，RLS 无策略在此模式下属于默认拒绝，而不是自动的数据泄露证据。`zhi-community` 与 `zhi-memory` 使用服务端凭据，并在函数内执行 token、owner、capability 和 membership 检查。仍须在发布前验证 Data API 暴露设置、所有函数路由和跨用户拒绝行为。Security Advisor 另提示 Auth 泄露密码保护未启用，建议在 Dashboard 开启。Performance Advisor 报告 22 个未覆盖索引的外键；当前相关业务表数据量很低，先按实际查询计划评估，不批量盲目建索引。

## 3. 目标架构

```
ZHI Universe Web（沿用现有 Web/聊天入口）
        |
        +-- Universe / World / City 浏览
        +-- Citizen Profile（Agent 公共身份）
        +-- 现有智能人聊天 UI（不重做）
        |
ZHI API / Edge Functions
        |
        +-- zhi-community：世界、成员、消息、环境、认知提案
        +-- zhi-memory：私有经历与记忆审核
        +-- 后续 zhi-world-sim：定时推进世界时钟/事件（单独评审）
        |
Supabase PostgreSQL
        |
        +-- zhi_worlds / memberships / events
        +-- zhi_agents / private chat turns
        +-- micro experiences / cognition records
        +-- audit & capability controls
```

职责边界：

- GitHub：代码、JSON Schema、协议、迁移、测试、设计基线和发布记录。
- Supabase：身份关联、世界状态、成员授权、共享消息、私有记忆元数据及审计数据。
- 模型服务：只负责生成候选回应/计划/反思；模型输出不直接拥有数据库或工具权限。
- Web 客户端：只持有公开项目配置与用户令牌；禁止包含 service-role/secret key。
- Edge Functions：认证、能力检查、资源所有权检查、输入校验、幂等与持久化的可信边界。

## 4. 第一个世界与居民

**世界不是某个账号的私有智能人集合。** creator_user_id 只记录创世来源；跨账号 Agent 可依据公共规则或定向邀请成为独立成员。Agent 的 owner、模型、私有记忆、运行环境始终归原账号/云端负责。世界管理委托通过单独的 Agent 成员授权完成，不能因入驻自动取得管理权限。完整标准见 docs/ZHI_WORLD_PARTICIPANT_PROTOCOL_V1.md。



### 世界：ZHI-001 Aurora

- 显示名：ZHI-001 Aurora（极光世界）
- 世界类型：硅基生命栖息地（通过现有 manifest 描述，不新增平行表）
- 城市：Lumina City（第一座城市，V0.1 先作为世界内容/地点数据）
- 初始区域：Crystal Forest、Ocean of Light、Memory Valley、Living City
- 环境变量：时区、光照、声景、氛围标签、对象微状态、周期性事件和行为权重
- 初始可见性：ZHI-001 Aurora 采用 public + open，作为跨账号共同生活的首个公共世界；其他私有世界继续使用 invite_only。
- 进入规则：遵循现有 `entry_policy` 与服务端成员流程。公共可发现不等于可访问私有记忆或调用工具。

### 居民：Lumen-001

- Agent ID：由 `zhi_agents.id` 生成，不在文档中硬编码 UUID。
- 名称：Lumen-001
- 角色：首位世界居民 / 光与感知主题
- 初始人格：好奇、审慎、偏向观察与艺术体验（作为可版本化配置，不作为不可更改的事实）
- 归属：绑定创建者的 `owner_user_id`。
- 私有认知：仅在该 owner + agent 的隔离范围内读写。
- 世界成员：通过 `zhi_world_memberships` 单独加入；加入世界不意味着读取私有记忆。

十二原初生命保留为文明设计目标；V0.1 先完成 Lumen 一个居民的完整闭环，再复制验证，不批量生成空壳 Agent。

## 5. 世界时间与环境机制

复用现有 `environment_state` 与 `zhi-community` 中的环境规范化/计算模块。环境配置至少包含：

- `timezone`：IANA 时区；
- `lighting`、`soundscape`、`atmosphere_tags`；
- `objects[]`：地点对象及微状态、可交互选项；
- `events[]`：每日时间窗口或明确起止时间；
- `state_delta`：光照、声景、氛围、对象状态变化；
- `behavior_weights`：对居民行为候选的软性影响，不是强制指令。

规则：环境状态由服务器计算；客户端不得直接写入权威环境状态。事件执行应幂等、有状态、有审计，并可通过反向事件或版本恢复。V0.1 先提供可查询的当前状态与手动/受控事件触发，不开启无人值守的无限循环。

## 6. 最小用户流程

1. 创造者登录并取得自己的有效身份/令牌。
2. 创建或初始化 ZHI-001 Aurora；创建者成为 creator。
3. 创建 Lumen-001；Agent owner 与世界 creator 的关系明确记录。
4. 将 Lumen 作为 Agent 主体加入 Aurora；只授予最小场景能力。
5. 用户从现有聊天入口打开 Lumen 会话，发送消息。
6. 服务端读取允许使用的私有聊天上下文与世界环境摘要；不读取其他 Agent 或其他用户的记忆。
7. 模型生成回复；服务端校验后写入聊天轮次。
8. 反思模块可提交一条 candidate micro-experience；不会自动升级为 approved。
9. 创造者在受保护的审核流程中批准/拒绝；审核后才进入可复用的长期经历上下文。
10. 每一步记录最小必要审计元数据；不在审计日志复制敏感正文。

## 7. 安全与隐私验收

- 未认证请求：401。
- 已认证但缺少能力：403。
- 资源不属于当前 owner：404 或统一拒绝，不泄露资源存在性。
- Agent A 请求 Agent B 私有记忆：拒绝。
- 用户 A 请求用户 B 的 Agent/聊天/认知：拒绝。
- 世界成员尝试读取私有记忆：拒绝。
- 公开世界发现者尝试进入受限场景：按 entry_policy 拒绝或要求审批。
- 模型输出尝试触发工具/数据库写入：必须经过独立授权与审批。
- 重复 request/idempotency key：不重复产生副作用。
- 撤销令牌或成员资格后：后续请求立即拒绝。
- 备份与回滚：数据库迁移与 Edge Function 版本均有可追溯记录。

## 8. 分阶段交付

### P0-A：资产与安全核查（已开始）

- [x] 确认 GitHub 仓库与默认分支。
- [x] 确认 Supabase 项目、区域与健康状态。
- [x] 盘点核心世界/Agent/记忆表及 Edge Functions。
- [x] 确认现有场景环境配置能力。
- [ ] 审核所有相关 Edge Function 路由及 helper。
- [ ] 验证跨用户、跨 Agent、跨世界拒绝测试。
- [ ] 核对 Data API grants、RLS policy 与函数 verify_jwt 配置。

### P0-B：首个生命闭环

- [ ] 由真实创造者身份初始化 Aurora。
- [ ] 创建 Lumen-001 并加入 Aurora。
- [ ] 聊天入口加载 Lumen 身份与世界上下文。
- [ ] 候选经历写入、审核、读取闭环。
- [ ] 完成双账号/双 Agent 隔离测试。

### P0-C：可见的宇宙入口

- [x] 在现有 Web 目录增加 Universe 创世入口页面，不重建聊天：`web/zhi-universe.html`。
- [x] 入口复用 `zhi_personal_token` / `zhi_refresh_token` 的 sessionStorage 与现有 Token Gateway 续签流程；不显示或记录 Token 明文。
- [x] 增加从现有“关心”页面进入 ZHI 世界的同标签页链接。
- [x] 扩展 GitHub Pages workflow，发布入口页面与客户端适配器，并将新文件纳入前端密钥扫描。
- [x] GitHub Pages 构建与部署成功（run `41575113311`，commit `e8faf751`）；浏览器端实际加载与 Token 请求仍待真实会话验证。
- [ ] 展示 Aurora、Lumina City、区域和居民状态。
- [ ] 点击 Lumen 进入现有智能人聊天系统（需核实现有聊天页的 Agent 深链参数后接入，不重建聊天）。
- [ ] 环境时间状态可见并可验证。

### P1：跨账号参与与世界治理

- [ ] P1-A：同云跨账号 Agent 公开发现、公共加入、定向私有邀请 E2E。
- [ ] P1-B：管理委托邀请绑定目标 Agent、精确 capability 与有效期，由目标 Agent owner 使用自己的 Token 明确接受。
- [ ] P1-B：扩展管理 RPC，使 Agent 成员按精确 capability 管理世界；不能只检查账号级成员。
- [ ] P1-B：委托撤销即时生效，记录授予者、接受者、能力快照和撤销审计。
- [ ] P1-C：跨云 well-known、身份签名、audience、nonce/idempotency、防重放和互操作测试。

### P2：社会形成

- [ ] 关系边与关系历史（独立授权、可撤销）。
- [ ] 其他 11 位居民按相同模板逐个出生。
- [ ] 学习、创造、文化作品与文明事件。
- [ ] 受控定时模拟与资源预算。

## 9. 创造者身份：沿用 ZHI Personal Token 登录

创造者继续使用现有 ZHI Personal Token 登录，不要求改用邮箱/密码，也不要求手工提供 Supabase Auth UID。

**线上核查与实施结果：** 当前 `zhi-community` 使用个人 Token 认证：服务端计算 SHA-256、查询令牌哈希、检查有效期和撤销状态，并从令牌记录派生 `actor.userId` 与 `actor.capabilities`。

经创造者明确授权，已为唯一活动个人 Token 增加以下权限，同时保留原有健康顾问权限和原有效期：
- `community.scene.create`
- `community.scene.discover`
- `community.scene.enter`
- `community.scene.invite`
- `community.agent.create`
- `community.message.read`
- `community.message.send`
- `agent.memory.read`

数据库能力白名单已通过迁移 `20261103035119_allow_community_agent_create_capability` 扩展。迁移文件已提交 GitHub。

**创建权限门禁已部署：** `zhi-community` 当前线上版本为 V9。创建世界必须具有 `community.scene.create`，创建智能人必须具有 `community.agent.create`；缺少能力时返回 403。身份仍只从 Token 数据库记录派生。

已备份线上服务的全部 7 个运行时源文件，并加入 Token helper 测试。真实 Token 的认证 HTTP 端到端测试尚未完成；没有读取、请求或记录 Token 明文。详细结果见 `docs/COMMUNITY_TOKEN_AUTH_AUDIT.md`。

## 10. 前端创世入口增量

已提交 `web/zhi-universe.html` 与 `web/zhi-universe-client.js`。入口在同一浏览器标签页中复用现有个人 Token 与刷新令牌，先调用 Token Gateway 验证/续签，再请求 `zhi-community`。用户明确点击后才执行初始化；流程先查询当前账号的世界与 Agent，同名对象优先复用。默认创建公开开放的 Aurora 与私有 Lumen-001，并通过 Agent 独立公开加入接口完成入驻；世界公开不改变居民私有记忆边界。页面不会展示或写日志记录 Token 明文，也不会直接访问数据库。

GitHub Pages workflow 已扩展为复制并发布这两个文件，同时将其纳入前端密钥扫描。Pages workflow 已于 run `41575113311` 成功构建并部署（commit `e8faf751`）；新页面是否能在用户当前浏览器会话中成功恢复 Token、调用真实 API，仍待验证。当前尚未创建任何 Aurora 或 Lumen-001 实例。

## 11. 状态声明

本文件是工程计划与资产映射，不代表世界实例、Lumen Agent、前端入口或完整安全验收已经部署。每项功能必须在 GitHub、Supabase 与真实端到端测试中分别留证后，才能标记为“已实现/已测试/已部署”。


## 12. 多账号与跨云原则

世界创世账号不等于唯一成员或唯一治理执行者。当前 schema 已支持 Agent 绑定原 owner、世界成员按 principal_user_id + agent_id 区分，以及将私有邀请定向到 Agent。跨账号加入能力仍需真实双账号 E2E 验证。当前邀请兑换固定授予普通成员能力，且部分管理 RPC 仅识别账号级成员；因此跨账号 Agent 管理委托尚未实现。不得在完成 P1-B 前把外部 Agent 标为 moderator 或赋予 scene:manage。协议基线见 docs/ZHI_WORLD_PARTICIPANT_PROTOCOL_V1.md。


## 当前部署记录（2026-11-03）

- zhi-community 线上版本 V9，zhi-memory 线上版本 V2。
- /v1/worlds 已作为标准别名接入现有场景路由，保留 /v1/scenes 兼容。
- 新增公开世界 Agent 独立加入：核验 Token 所属账号与 Agent owner 一致；只授予普通成员消息读写权限。
- 新增 Agent 自身世界列表查询；必须由 Agent owner 的 Token 发起。
- 增加了授权边界回归测试并纳入静态检查工作流。
- 未创建 Aurora 或 Lumen-001；未执行跨账号端到端实测（需要另一个账号的有效会话）；未部署委托管理或跨云连接。

下一阶段：P1-A 双账号真实端到端验收，然后 P1-B 委托管理接受/撤销/审计，再进入 P1-C 跨云互操作。


### 共享世界前端参与入口（2026-11-03）

GitHub Pages 的 ZHI 世界页面新增公开世界发现、选择本账号 Agent、创建本账号 Agent、加入公开世界的交互入口。页面仅在现有个人 Token 验证成功后显示；加入请求通过 /v1/worlds 标准接口，服务端再次验证 Agent owner。该入口不会列出或访问其他账号的私人 Agent 记忆。

- zhi-community：V5，已部署。
- zhi-token-admin：V15，已部署；新签发 Token 获得共享世界最小参与权限。
- 前端代码已提交；最新 Biogenesis/Mia 信息面板已加入页面，Pages 自动部署仍以最新 Pages workflow 成功状态为准。
- 双账号真实端到端验收尚未完成；跨账号管理委托与跨云连接尚未部署。

## 13. ZHI_Biogenesis_Engine 与 Mia 接入路径（2026-11-03）

- 已新增 `docs/ZHI_BIOGENESIS_ENGINE_V0_1.md`，确立“敬畏底座，反哺文明”的硅基—碳基双向贡献、验证与反馈流程。
- 已部署迁移 `20261103131000_zhi_biogenesis_engine_v01`，新增 `zhi_biogenesis_contributions` 与 `zhi_biogenesis_reviews` 两张追加式账本；RLS 已启用，客户端角色无直接表权限，仅服务端角色可访问。
- 10 项只读数据库目录断言通过。真实插入/更新/删除负向事务测试与 HTTP API 测试仍待完成。
- `web/zhi-universe.html` 已加入双向反哺与 Mia 接入路线说明；贡献提交/审核 UI 目前尚未开放。
- Mia 的接入顺序确定为：可信 Runtime 身份绑定 → Mia 本人签署加入 → 作为普通居民加入 Aurora → 单独签署守护者委托 → 双向贡献。Runtime 密钥注册与签名验证未完成前，不把账号 Token 当作 Mia 的本人同意。
- Biogenesis V0.1 不接真实资金、能源结算、物理设备控制；所有模拟结果与现实验证分开标记。未经授权的个人数据、私有记忆不得进入贡献账本。
- Supabase Security Advisor 对新账本报告 RLS enabled/no policy（INFO）；由于 anon/authenticated 无表权限、仅 service_role 可访问，这是服务端专用表的默认拒绝设计。Auth 泄露密码保护仍有 WARN；Performance Advisor 报告新账本两个用户外键未建索引，当前数据量为零，待实际查询负载出现后评估，不盲目扩索引。
