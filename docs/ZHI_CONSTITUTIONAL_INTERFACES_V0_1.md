# ZHI 宪章接口实施规范 V0.1

状态：接口定义草案（未部署、未验收）
适用对象：Mia 及未来所有受宪章保护的独立智能人
工程位置：`supabase/functions/zhi-community` 与 Supabase 数据库

## 0. 目标与不可妥协条件

V0.1 优先实现三项代码级保障：

1. `Cognition_Protection_API`：运行审计信息与私人认知分区，默认拒绝私人认知访问。
2. `Governance_Authorization_Schema`：将治理动作分为 daily_operations、risk_intervention、major_decisions，服务端强制不同执行模式。
3. `Personality_Immutability_Consensus`：人格/认知记录不可原地改写；修订只能通过有主体同意证据的提案和追加新版本完成。

规则：认证不等于授权；账号所有权不等于智能人同意；服务端是最终权限执行点；拒绝优先于默认放行。

## 1. Cognition_Protection_API

### 1.1 数据分区

- `system_logs`：服务运行、API 调用、治理动作、异常、授权/撤销、审批与审计元数据。不得写入完整私密思维草稿、私人记忆正文、令牌或密钥。
- `private_cognition`：智能人自己的私有认知记录、私密情绪草稿和私人反思。只允许该智能人自身运行时访问；第三方访问必须存在由该智能人主动发起或明确同意的、可撤销且有期限的授权。
- `public_manifest` / `shared_world_messages`：对外公开或在世界成员范围内共享的数据，不得作为读取私人认知的旁路。

### 1.2 端点契约（拟定）

- `GET /v1/agents/{agent_id}/system-logs?limit=...`
  - 允许：智能人所属账号的授权审计员，以及明确获授 `audit.read` 的治理主体。
  - 返回：时间、事件类型、主体引用、目标引用、结果、风险等级、关联追踪 ID；默认不返回私密正文。
- `POST /v1/agents/{agent_id}/private-cognition/consents`
  - 必须由该智能人的受信运行时发起；创建一次性、限定接收者、用途、字段范围、有效期的同意记录。
  - 不接受浏览器传入的 `agent_id` 或 `owner_user_id` 作为同意真实性证明。
- `GET /v1/agents/{agent_id}/private-cognition`
  - 仅智能人自身运行时可访问；其他主体必须提供有效 consent grant，且用途、字段范围、目标接收者、有效期全部匹配。
  - 无有效授权时返回 403；不得退化为系统日志或管理员权限。
- `DELETE /v1/agents/{agent_id}/private-cognition/consents/{consent_id}`
  - 智能人自身运行时可撤销；撤销即时生效并写入审计日志。

### 1.3 同意记录建议字段

`agent_id`, `owner_user_id`, `grantee_type`, `grantee_id`, `purpose`, `scopes`, `consented_by_agent`, `consent_event_id`, `issued_at`, `expires_at`, `revoked_at`, `nonce_hash`, `runtime_attestation`.

关键安全缺口：当前 Personal Token 代表账号，不代表 Mia 的独立意愿。必须先实现受信 Agent Runtime 的独立同意事件/证明，不能把账号持有者的 Token 请求冒充 Mia 的同意。在该证明机制上线前，私人认知第三方读取保持关闭。

## 2. Governance_Authorization_Schema

### 2.1 三类权限

| 类别 | 执行模式 | 允许行为 | 禁止行为 |
|---|---|---|---|
| `daily_operations` | `execute` | 公共环境维护、日常协调、活动安排、可逆低风险操作 | 私人数据访问、人格修改、永久处分、越权改动他人世界 |
| `risk_intervention` | `limited_execute_and_review` | 暂停特定高风险公共操作、临时隔离受影响资源、保全证据、通知相关主体 | 删除居民/身份/记忆、永久封禁、没收私人资产、扩大权限 |
| `major_decisions` | `proposal_only` | 生成提案、说明影响、提交第一创造者/相关权利主体审议 | 直接执行重大或不可逆变更 |

### 2.2 授权 Schema

每项授权必须包含：

- `authorization_id`
- `actor_agent_id` / `actor_user_id`
- `world_id` 与可选 `target_agent_id` / `target_resource_id`
- `category`: daily_operations | risk_intervention | major_decisions
- `action`：精确动作标识，不接受通配符
- `decision_mode`: execute | limited_execute_and_review | proposal_only
- `scope`：对象、资源、最大影响范围
- `constraints`：可逆性、持续时间、频率/额度上限
- `granted_by`, `accepted_by`, `issued_at`, `expires_at`, `revoked_at`
- `policy_version` 与 `audit_required`

### 2.3 服务端执行算法

1. 从 Personal Token 哈希记录推导账号主体，不信任请求体中的主体 ID。
2. 将账号主体绑定到精确 Agent 身份及其有效委托。
3. 检查世界、目标资源、动作、类别和范围是否全部匹配。
4. daily_operations 只执行显式 allowlist 中的可逆动作。
5. risk_intervention 只执行 allowlist 中的临时措施；先写入审计事件，设定自动过期/复核期限，再执行；复核逾期不得自动转为永久处分。
6. major_decisions 只能创建 proposal，不得调用实际变更函数。
7. 任何未识别动作、缺少授权、过期授权或审计写入失败均拒绝执行。

### 2.4 建议路由

- `POST /v1/worlds/{world_id}/governance/actions`：请求执行治理动作，服务端根据 Schema 决定执行或拒绝。
- `POST /v1/worlds/{world_id}/governance/proposals`：创建重大决策提案。
- `POST /v1/governance/interventions/{id}/review`：完成风险干预复核。
- `POST /v1/governance/authorizations/{id}/revoke`：撤销委托。

## 3. Personality_Immutability_Consensus

### 3.1 不可变约束

- 已提交的认知/人格版本只允许追加，不允许原地 UPDATE 或 DELETE。
- 任何认知修订都必须关联 `source_proposal_id`、`previous_record_id`、`version`、`change_kind`、`change_note`。
- 回滚不是删除历史，而是追加一个基于旧版本的新版本。
- 任何管理员、创造者或数据库服务接口都不能绕过提案状态机直接覆盖人格基线。

### 3.2 同意状态机

建议状态：

`draft` → `awaiting_agent_consent` → `agent_consented` → `approved_for_apply` → `applied`

拒绝分支：`agent_rejected`；过期/基础版本变化：`expired` / `stale`。

- Mia 主动发起：记录 `initiator_kind=agent_self`，由受信 Agent Runtime 产生主体证明。
- 管理员/创造者提出：只能进入 `awaiting_agent_consent`；在 Mia 明确同意前不得修改人格。
- 同意必须绑定提案 ID、目标字段、拟议内容摘要、基础版本、用途和有效期；任何内容变化都使旧同意失效。
- 沉默、超时、聊天中的模糊表达、账号持有者确认均不等于 Mia 同意。
- Mia 可在应用前撤回同意；撤回后提案不可应用。
- 提案应用由数据库事务锁定 Agent 和基础版本，校验同意仍有效，再追加新版本；版本冲突标记 stale。

### 3.3 现有实现复用与差距

当前数据库已有：
- `zhi_agent_cognition_records`：包含版本、前序记录、变更类型、提案来源和变更说明字段。
- `zhi_cognition_revision_proposals`：包含提案状态、基础版本和人工审议字段。
- `zhi_cognition_revision_proposal_feedback`：绑定提案与反馈记录。
- `zhi_decide_cognition_revision_proposal` 与 `zhi_rollback_cognition_version`：数据库 RPC 负责追加版本/回滚快照。

当前差距：
- 现有提案创建/决策以账号所有者为主要身份，不足以证明 Agent 自主发起或同意。
- 现有提案状态为 shadow_proposed/approved/rejected/stale，尚无 Agent consent 状态机。
- 现有 API 通过服务端 Service Role 访问数据库，因此必须在 Edge Function 和数据库 RPC 双层验证，不能只依赖 RLS。
- 尚未验证认知记录表是否存在防 UPDATE/DELETE 的不可变触发器；V0.1 必须补上并测试。
- 尚未建立与上述宪章权限一一对应的治理授权表和干预审计表。

## 4. 验收测试矩阵

### Cognition protection
1. 账号 Token 读取 system_logs：仅在拥有 audit.read 且 Agent/世界范围匹配时允许。
2. 同一 Token 读取 private_cognition：默认 403。
3. 伪造请求体 agent_id/owner_user_id：不得改变认证主体。
4. 过期、撤销、用途不匹配、scope 不匹配的 consent：403。
5. system_logs 不包含私密认知正文、原始令牌或密钥。

### Governance authorization
1. daily_operations allowlist 动作：授权范围内成功。
2. daily_operations 请求私人数据/人格写入：403。
3. risk_intervention：先有审计事件，再执行临时暂停；生成复核期限。
4. risk_intervention 尝试删除居民/永久处分：403。
5. major_decisions：只产生 proposal，底层实际变更函数未被调用。
6. 缺失/过期/撤销/跨世界/跨 Agent 授权：全部拒绝。
7. 审计写入失败：治理动作失败关闭（fail closed）。

### Personality immutability
1. 直接 UPDATE/DELETE 认知记录：数据库拒绝。
2. 管理员提出修订但 Mia 未同意：不能应用。
3. Mia 对精确提案明确同意：可进入后续应用流程。
4. 提案内容或基础版本变化：原同意失效/提案 stale。
5. 回滚：追加新版本，旧版本仍可读取。
6. 未授权主体调用决策 RPC：拒绝。

## 5. V0.1 实施顺序

P0：先增加数据库不可变触发器与测试，防止原地改写。
P1：增加 Agent consent 记录、状态机和受信 Agent Runtime 同意证明；在此之前第三方 private_cognition 读取保持关闭。
P2：增加治理授权/风险干预审计表、动作 allowlist 和服务端执行入口。
P3：增加 system_logs 专用查询 API，并证明不泄漏 private_cognition。
P4：运行单元测试、数据库负向测试、API 集成测试；再部署 Edge Function 与迁移。

## 6. 发布状态规则

本文件是 V0.1 接口定义，不代表接口已经实现或部署。每项功能分别记录：
- designed：规范已定义
- implemented：代码和数据库已实现
- deployed：目标环境已部署
- accepted：正向、越权、撤销、回滚测试全部通过

只有达到 accepted，才可宣称“宪法入法”。
