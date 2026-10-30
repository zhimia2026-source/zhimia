# ZHI 关心机制 × 聊天主入口接入实施契约 v0.2

状态：**接入前置审计完成；尚未接入聊天 UI；禁止宣称端到端完成。**

更新日期：2026-10-30

## 1. 本轮核查结论

目标 Supabase 项目固定为 `lvxmygrgqtmzqgailmyl`。

已核实：
- `zhi-care` Edge Function 为 ACTIVE v7，`verify_jwt=true`，通过 Supabase Auth `getUser(token)` 验证 JWT。
- CareState 数据表为 `zhi_care_states`、`zhi_care_events`、`zhi_care_approval_tickets`；均启用 RLS，未开放 anon/authenticated 直连策略。
- 个人令牌路径由已部署的 `zhi-token-gateway` 验证 opaque token（SHA-256 哈希查表）；令牌记录现有 `capabilities` 字段，包含 `care.read`、`care.write`、`care.approve` 等细粒度能力。
- 独立的 `zhi-care-personal` 适配器已提交到仓库，但**尚未部署**；它从令牌记录派生 user_id，不信任请求体身份字段。JWT-only 的 `zhi-care` 保持原样，不关闭 JWT 验证。
- Care 审批申请/批准现由两个原子 RPC 在同一事务写入票据与审计事件；数据库回滚式集成测试已覆盖成功、过期和 revision 失效路径。JWT 版 v7 已通过 CI 类型检查并部署；个人令牌版已通过 Deno 类型检查及能力映射/过期撤销守卫单元测试，但 HTTP、跨账号隔离和聊天 UI 接入仍待完成。
- 当前仓库未检索到 `agent-talk.html` 等聊天前端源文件；聊天接入审计依赖用户此前上传的旧 ZIP 静态检查结果，不能据此直接改写线上聊天页面。

## 2. 必须先解决的身份协议不匹配

当前存在两种凭证路径：
1. Care API：Supabase Auth JWT，Edge Gateway 先验 JWT，函数内部再次调用 Auth `getUser`。
2. 社区草案：个人访问令牌（opaque bearer token），服务端按 SHA-256 哈希查询令牌表并检查撤销/过期。

这两种凭证不可互换。不得把个人令牌直接交给 JWT-only 的 `zhi-care`，也不得把请求体里的 `user_id` 当作身份凭据。

此外，个人令牌表现已具备细粒度 `capabilities` 白名单，默认只签发最小健康聊天权限；续签继承原能力。个人令牌版 Care 适配器源码按 `care.read`、`care.write`、`care.approve` 门禁，但尚未部署，不能宣称该凭证路径已经通过 HTTP 与跨账号隔离验收。

## 3. 推荐的安全接入决策

**首选：聊天 UI 使用目标 Supabase 项目的原生 Auth session；Care API 继续只接受该项目 JWT。**

实施前提：
- 旧聊天 UI 必须完成独立身份登录迁移；共享管理员密码不再作为普通用户认证。
- 每次请求由服务端从 JWT 得到 user.id，再查 Agent 所有权映射；客户端传入的 agent_id 只是目标选择，不是所有权证明。
- 聊天 API、Care API 分别检查 chat.read/chat.send 与 care.read/care.write 能力。
- 如果现有聊天页面只能持有个人 opaque token，则先单独设计受限 token scope 与统一验证中间层；不能临时关闭 JWT 验证并把所有有效个人令牌视为全权限凭证。

## 4. 聊天事件进入关心机制的规则

不要把每条聊天消息自动复制进 CareState。聊天内容可能包含敏感信息，也不代表每条消息都是有效关心证据。

建议流程：
1. 聊天消息先按会话权限正常保存。
2. 关心识别层只产出结构化候选：target_ref、care_focus、evidence_ref、evidence_status、event_time、source_ref。
3. evidence_status 必须明确区分 observed / reported / verified / inferred / hypothesis / unknown / conflicted；对内心状态的推断不得标记为 observed。
4. 默认只保存消息 ID / 受控引用，不把消息原文写入 Care events metadata。
5. 只有当用户/智能人策略允许且 Care owner 匹配时，才调用 Care API 写入证据。
6. 证据写入使用 Care API 的 revision 乐观并发；冲突时重新读取并复核，禁止覆盖新版本。
7. 行动计划进入 action_review；只有显式审批票据批准后才能转为 in_progress。该状态不代表现实动作已执行。
8. 结果通过独立反馈引用回写；用户拒绝、暂停或撤销时停止后续行动。

## 5. 需要补齐的最小数据映射

| 源对象 | Care 目标字段 | 规则 |
|---|---|---|
| 已验证用户 | Care owner user_id | 只由服务端身份验证产生 |
| Agent ownership | 服务端映射 | 不信任客户端 agent_id |
| Chat message | evidence_ref | 只存稳定引用，不复制原文 |
| Chat conversation | source_ref | 用于回溯授权来源 |
| 对象/关系 | target_ref / relationship_context_ref | 不混淆不同对象 |
| 时间 | event_time / observed_at | 事件发生时间与系统观测时间分开 |
| 识别结果 | epistemic_status | 推断、报告、事实和冲突分开 |

## 6. 实施阶段与验收

### A. 获取并确认聊天 UI 当前源代码
- [ ] 确认当前线上页面 URL、GitHub 仓库/分支/文件路径。
- [ ] 确认页面当前认证方式与调用的聊天 Edge Functions。
- [ ] 确认当前消息、会话、Agent 的真实表结构和所属关系。
- [ ] 对旧聊天数据库完成只读盘点；在迁移计划、备份与恢复演练前不切换生产流量。

### B. 统一身份与授权
- [ ] 聊天 UI 只使用目标项目独立身份登录，不再使用共享管理员密码。
- [ ] 服务端验证会话，并查出 user → Agent ownership。
- [ ] 逐请求检查会话成员关系与能力。
- [ ] 伪造 user_id / agent_id、过期或撤销凭证均被拒绝。
- [ ] 不向浏览器暴露 service_role / secret key。

### C. Care adapter
- [ ] 使用可信服务端 JWT 调用 `zhi-care`。
- [ ] 对 care.read / care.write 单独授权。
- [ ] 只写 evidence_ref/source_ref 等最小元数据，不写聊天原文。
- [ ] 覆盖 revision 冲突、状态非法转换、票据过期、票据重放与跨用户访问。

### D. 端到端验收
- [ ] 两个真实独立账号 A/B：A 不能读取或修改 B 的 Agent、会话、消息、CareState、审批票据。
- [ ] A 不能仅通过伪造 agent_id 访问 B 的数据。
- [ ] Care API 不接受个人 opaque token 冒充 Supabase JWT。
- [ ] 用户撤销令牌/会话后，后续受保护请求按约定失效。
- [ ] 桌面与移动端聊天回归通过。
- [ ] GitHub CI、数据库迁移测试、真实 API 测试全部通过。

## 7. 当前阻塞与下一动作

当前不是 Care 状态机或数据库缺失，而是**聊天 UI 源码与真实身份链尚未接入**。仓库没有找到可直接修改的聊天前端文件，且 Care API 与个人 opaque token 的认证模式不同。

下一步必须取得当前聊天入口的源文件/仓库路径和真实聊天 API 资源映射，再按本契约做适配。不得通过放宽 JWT 验证、信任客户端 user_id/agent_id 或开放 Care 表直连权限来绕过阻塞。


## 8. 个人令牌 Care 适配器进度（2026-10-30）

- 新增数据库 RPC：`zhi_care_request_approval_atomic`、`zhi_care_approve_action_atomic`；两者均为 SECURITY INVOKER，仅 service_role 可执行。
- 新增审批审计事件：`approval_requested`、`approval_granted`、`approval_expired`、`approval_invalidated`。
- 已在目标 Supabase 项目完成回滚式 SQL 集成测试，覆盖申请、批准、一次性消费、审计完整性、过期与 revision 失效；测试事务已回滚，不留合成数据。
- 不得把适配器标记为生产可用：Edge Function 尚未部署，个人令牌 HTTP 测试与两个独立账号隔离验收尚未完成。
