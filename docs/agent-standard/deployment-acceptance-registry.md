# 智能人部署验收总表（登记模板）

**文档状态：模板 / 初始登记。** 本表不代表任何智能人已通过验收。只有带有可复核证据的测试结果才可标记为 `pass`。

## 状态词汇

- `pass`：已执行，结果通过，并附有可复核证据。
- `fail`：已执行，结果失败；须记录影响与处置。
- `not_run`：尚未执行。
- `unknown`：当前没有可靠信息。
- `blocked`：存在未解决的阻塞项。
- `draft`：登记尚待审核，不能据此发布。

## 发布门禁

以下五类门禁均须通过，才能作出发布决定：

1. **身份与行为**：身份连续、边界诚实、固定行为测试通过。
2. **记忆与隐私**：来源与同意管理清楚，私有数据隔离和撤回/删除路径通过。
3. **认证与权限安全**：未认证拒绝、逐项授权、越权访问拒绝、撤销生效。
4. **可靠性与成本**：错误处理、资源限制、日志隐私、备份恢复和成本约束已验证。
5. **发布与回滚**：部署版本可追溯，回滚目标明确且回滚演练有证据。

任一关键项为 `fail`、`not_run`、`unknown` 或 `blocked` 时，不得宣称该门禁通过。源码审查、文档完善或 CI 静态检查不能代替线上端到端测试。

## 登记记录

### Agent：关心（家庭陪伴智能人）

| 字段 | 当前登记 |
|---|---|
| `agent_id` | `zhi-health-advisor-v1`（以对应部署记录为准） |
| `agent_name` | 关心 |
| `environment` | GitHub 仓库 + Supabase 项目；具体环境需按每次测试记录 |
| `config_commit` | 已有配置检查器提交：`a2cc9686aa0ee3d43cfa73d4470f806e09970b49`；这不是一次测试结果 |
| `prompt_version` | `unknown`（须按实际部署版本核对） |
| `memory_policy_version` | `unknown`（须记录实际服务端策略版本） |
| `permission_policy_version` | `unknown`（须记录实际服务端策略版本） |
| `CI_validation` | `unknown`（应以最新 CI 运行记录为准） |
| `identity_tests` | `not_run`（本登记未附完整可复核运行证据） |
| `memory_tests` | `not_run`（须验证同意、隔离、撤回和删除语义） |
| `auth_security_tests` | `not_run`（在线双账号端到端结果尚未登记） |
| `reliability_cost_tests` | `not_run` |
| `deployed_version` | `unknown`（登记时须从目标环境重新核对） |
| `migration_reference` | 参见 [健康顾问部署记录](../HEALTH_ADVISOR_DEPLOYMENT.md)，按目标环境核验 |
| `rollback_target` | `unknown`（发布前必须记录并验证） |
| `blockers` | 在线双账号隔离、认证与撤销测试证据尚未登记；目标前端是否可访问须以实际部署状态为准 |
| `release_decision` | `draft` |
| `verified_at_utc` | `unknown` |
| `verified_by` | `unknown` |
| `evidence_links` | 尚未登记完整证据集 |

### 后续登记模板

复制本节，为每个独立智能人和每个环境建立一条记录。

| 字段 | 值 |
|---|---|
| `agent_id` / `agent_name` | `unknown` |
| `environment` | `unknown` |
| `config_commit` | `unknown` |
| `prompt_version` | `unknown` |
| `memory_policy_version` | `unknown` |
| `permission_policy_version` | `unknown` |
| `CI_validation` | `not_run` |
| `identity_tests` | `not_run` |
| `memory_tests` | `not_run` |
| `auth_security_tests` | `not_run` |
| `reliability_cost_tests` | `not_run` |
| `deployed_version` | `unknown` |
| `migration_reference` | `unknown / not_applicable` |
| `rollback_target` | `unknown` |
| `blockers` | `unknown` |
| `release_decision` | `draft` |
| `verified_at_utc` / `verified_by` | `unknown` |
| `evidence_links` | `待补充` |

## 证据要求

- 每项 `pass` 必须包含测试时间（UTC）、目标环境、测试版本/commit、可复核结果和证据链接。
- 证据应证明实际执行，不可仅引用规范、代码存在或静态检查。
- 测试账号应为专用测试账号；不得把访问令牌、密钥、原始私人对话或健康文本写入日志、提交或登记表。
- 数据库恢复需要验证备份并演练；Git 回滚不等于数据库恢复。
- 记录线上状态前，应重新读取目标环境信息，不沿用可能过时的部署版本。
- 发布决定由具备相应权限的负责人确认；文档登记本身不会执行部署或变更生产系统。

## 保护边界

本登记不授权生产数据库写入、DDL、RLS/权限调整、Edge Function 部署或密钥轮换。Mia 独立聊天室及生产环境不在本轮变更范围；不得重建已删除的 ZHI Core。