# ZHI 单一 Supabase 项目部署与数据归并方案 v1.0

状态：**目标架构已确定；聊天 Core 归并尚未实施；禁止在验收前切换生产流量。**

## 1. 唯一后端基准

ZHI 智能社区、个人身份、聊天、私有记忆、关心机制、场景/成员关系、授权票据和审计数据统一使用：

- Supabase Project Ref：lvxmygrgqtmzqgailmyl
- Project URL：https://lvxmygrgqtmzqgailmyl.supabase.co
- 区域：ap-southeast-1

所有新的数据库表、RLS、RPC、Edge Functions、Storage 和 Realtime 绑定必须指向这个项目。仓库中不得再把另一个 Supabase project ref 作为 ZHI 的目标数据库。

## 2. 架构决定

统一数据库项目不等于统一授权。继续保持：

- 每个个人/智能人有独立主体与 Agent 归属。
- 私有记忆默认严格隔离；不因数据库在同一项目而自动共享。
- 使用同一 Supabase Auth 项目中的已验证用户会话；服务端从验证后的 JWT / auth.uid() 取得主体，不能信任请求体中的 user_id。
- 聊天、历史、记忆、关心状态、场景成员关系、广播和工具执行分别授权。
- service_role 只允许服务端 Edge Function 使用，绝不能放进浏览器。
- 所有受保护的公开 schema 表启用 RLS，并逐表审查 grants 与 policies；只启用 RLS 而无正确策略，不代表功能已经安全或可用。

单项目架构下，原计划中“个人令牌网关到另一个 Core 项目的跨项目身份断言交换”不再是目标方案。应使用目标项目内的原生认证上下文和服务端授权。旧系统若有不同项目的用户 UUID、消息 ID 或权限记录，仍需显式映射与归并，不能直接假定一致。

## 3. 目标项目当前已确认内容

只读盘点确认目标项目处于 ACTIVE_HEALTHY 状态，区域为 ap-southeast-1，Postgres 17。已存在并启用 RLS 的相关表/功能包括：

- 个人令牌：zhi_personal_access_tokens
- 续签凭证：zhi_refresh_credentials
- 健康顾问对话、同意、记忆与审计表
- 关心状态：zhi_care_states、zhi_care_events、zhi_care_approval_tickets
- Edge Functions：zhi-health-advisor、zhi-token-gateway、zhi-token-admin、zhi-care

这些元数据只证明资源存在，不代表所有 RLS 策略、用户流程或端到端调用已通过验收。聊天 Core 的目标项目内替代实现尚未确认完成。

## 4. 旧聊天数据与代码归并

用户提供的旧聊天源码显示其原先使用另一个 Supabase 项目。按以下步骤迁移：

1. **冻结源清单**：只读导出旧项目的表结构、索引、约束、RLS/policies、函数、触发器、Edge Functions、Storage bucket、Realtime 配置及依赖关系。不能只复制表。
2. **字段与身份映射**：记录旧用户、Agent、会话、消息、场景和文件 ID 与目标项目 ID 的映射；处理重复 ID、外键、时间戳和所有权差异。
3. **目标项目迁移脚本**：在功能分支生成可审查、可重放、可回滚的 migration；不一次性运行旧项目全部 SQL。
4. **先迁测试数据**：用合成账号和脱敏样本迁移，验证数量、关联完整性、排序、分页、消息归属、RLS 和文件权限。
5. **迁生产数据前备份**：取得可验证的备份与恢复方案，明确数据窗口、增量同步、冲突处理和恢复责任。
6. **兼容层与影子验证**：先部署新函数并进行只读比对，旧 UI 仍保留。比较旧/新 API 结果但不重复写入真实消息。
7. **小范围切换**：仅对测试账号启用新聊天路径，完成跨账号隔离、撤销、过期、并发和 UI 回归。
8. **正式切换**：确认备份可恢复且验收全部通过后再切换。观察稳定后，才评估是否停用旧项目资源；不要提前删除源数据或关闭旧入口。

## 5. 新聊天 API 必须满足

- chat.send：校验身份、Agent/会话权限、消息大小、速率限制和幂等。
- chat.read：按已验证主体与会话成员关系查询，不能只按客户端给的 agent_id 查询。
- agent.list_public：只返回公开目录字段。
- 私有记忆：必须有明确同意、owner scope 和独立读写授权。
- CareState：保留 owner、revision、状态机、原子审批票据消费及审计。
- 场景：区分公开/私人场景、发现/进入/管理权限；公开可发现不等于可读取内部数据或执行工具。
- 广播、主动消息 feed 和工具执行默认关闭，直到各自权限与审计测试通过。
- 所有失败均 fail closed；不可回退到共享管理员身份作为长期方案。

## 6. 连接配置规则

- 前端公开配置只能使用此项目 URL 与 publishable key（或受支持的 anon key）；绝不包含 service-role/secret key。
- Edge Functions 必须部署到同一个 project ref；所有 Supabase client URL、认证验证器、SQL 连接、Storage 和 Realtime 配置都必须核对一致。
- GitHub Actions/部署环境只能保存非敏感项目标识与服务端 secrets；密钥通过受控的 Supabase secret 管理配置，不提交到 Git。
- 删除旧 Core project ref 的前置条件：确认仓库、网页、CI、Edge Functions、环境变量、回调 URL 和部署配置均不再依赖它，并完成全量回归。
- 本文档不存放任何密钥、个人令牌或生产数据。

## 7. 验收清单

- [ ] 代码库中所有活跃的 ZHI 数据库连接都指向 lvxmygrgqtmzqgailmyl。
- [ ] 旧聊天源项目结构、数据量和依赖清单已归档并可追溯。
- [ ] 目标项目已具备聊天 Agent、会话、消息和必要索引/约束。
- [ ] 每张受保护表均有经审查的 RLS、policy 和 grants。
- [ ] 个人身份 A 无法读取或写入身份 B 的 Agent、会话、消息、记忆、CareState 或私有场景。
- [ ] 所有旧数据迁移有备份、校验、增量方案和恢复演练。
- [ ] 旧聊天 UI 桌面/移动端回归通过。
- [ ] 新聊天 API 真实身份端到端测试通过。
- [ ] PR CI 成功，生产切换获得明确批准。

在这些检查通过前，架构决定已统一，但聊天数据库迁移与完整产品接入仍标记为未完成。
