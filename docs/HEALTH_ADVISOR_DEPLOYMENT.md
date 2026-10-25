# ZHI 健康生活顾问智能人：首期部署记录

## 基准

- 设计基线：《ZHI 健康生活顾问智能人设计规范 v1.1》
- Prompt 基线：《ZHI 健康生活顾问智能人确定性等级 System Prompt 规范 v1.0》（该文件状态为待审阅）
- Agent ID：`zhi-health-advisor-v1`
- 首期范围：认证后的健康问答接口、安全覆盖 S、L0–L3 内部字段、私有会话与消息、最小审计。
- 不在首期范围：临床诊断、处方或剂量调整、CSI 临床风险分层、自动联系第三方、家庭成员之间的数据共享、自动长期记忆、外部医疗系统写入。

## 已知部署条件

Supabase 项目 `ZHIMIA`（ref `lvxmygrgqtmzqgailmyl`，region `ap-southeast-1`）初始为空。已应用 5 个仅新增对象的迁移；6 张 `zhi_health_*` 表已存在且启用 RLS。Edge Function `zhi-health-advisor` 已部署，当前 version 3，`verify_jwt=true`。这证明资源已部署，不等于端到端验收已完成。

## 部署顺序

1. 数据库迁移按序为 `202610250001_zhi_health_advisor_base.sql`、`202610250002_zhi_health_advisor_indexes.sql`、`202610250003_zhi_health_rate_limit.sql`、`202610250004_count_rate_retries.sql`、`202610250005_rate_events_service_only.sql`。目标项目已经应用。
2. 部署 `zhi-health-advisor` Edge Function，保持 `verify_jwt=true`。
3. 在 Supabase Function Secrets 中配置 `OPENAI_API_KEY`，可选 `ZHI_MODEL_NAME`，以及浏览器接入需要的 `ZHI_ALLOWED_ORIGINS`（逗号分隔的精确 origin）。不在仓库或客户端保存密钥。
4. 用已登录用户 JWT 做认证、跨用户隔离、急症关键词、幂等、速率限制、模型不可用和 CORS 测试。
5. 检查 Security/Performance Advisors 与函数日志。日志不得包含原始健康文本。
6. 只有 Critical 测试通过并完成医学/隐私审核后，才扩大试运行范围。

## 当前实现的明确限制

- 关键词安全筛查是保护性第一道筛查，不是完整临床分诊；没有触发也不能排除急症。
- 模型生成内容没有独立医学核验，故普通模型回答的确定性字段暂定为 L0。未来需设计逐条主张的证据解析和等级判定，不可把模型自信当作证据。
- 长期记忆表默认没有客户端写入策略；当前接口不写长期记忆，响应明确返回 `memory_written=false`。
- 速率限制为试点级的数据库计数器；高并发下并非严格原子限流器，扩大试运行前应换成原子配额/RPC 或专用限流服务。
- CORS 默认拒绝未配置的浏览器 origin；没有 origin 的服务端请求仍可按 JWT 认证调用。
- 如果 Supabase Data API 尚未向 PostgREST 暴露这些表，必须在项目 API 设置中仅为必要的表开启访问；不要为解决接入问题而开放 anon 角色或关闭 RLS。
- 部署前须确认模型服务商、地区数据处理、保留政策和用户告知满足实际合规要求。

## 当前运行状态

- 已部署函数：`https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-health-advisor`
- 当前函数版本：3，JWT 校验开启。
- 数据库：6 张新表均启用 RLS，当前记录数为 0。
- Security Advisor 最近一次检查发现 1 项 RLS 无策略提示（服务端专用的 rate-events 表）；已增加仅授予 `service_role` 的显式策略，需再次检查确认告警消失。
- Performance Advisor 在空表上报告多个尚未使用的索引；暂不移除，待真实查询负载后评估。
- 普通问答还需要在 Supabase Function Secrets 中配置 `OPENAI_API_KEY`。没有该密钥时普通问答会返回 503；关键词触发的 S 安全响应不依赖模型 API。
- 浏览器调用还需要配置 `ZHI_ALLOWED_ORIGINS` 为实际前端的精确 Origin。未配置的浏览器 Origin 会被拒绝。
- 现有仓库 CI 中包含 Deno 安全筛查测试；当前尚未取得成功运行的 CI 结果，因此不能标记为测试通过。

## 回滚

- Edge Function：将函数恢复到前一已知版本，或暂停客户端调用；不要关闭 JWT 校验来规避故障。
- 数据库：本迁移仅新增对象。回滚前先确认没有需要保留的会话数据；生产环境不要直接 DROP 表。优先禁用新入口并保留数据，另行审批数据删除。
- 模型异常时：普通问答返回服务不可用，不猜测或伪造回答；S 安全响应仍可独立触发。

## 验收清单

- [ ] 未登录请求被拒绝。
- [ ] 用户 A 无法读取用户 B 的会话、消息、记忆和审计记录。
- [ ] 客户端不能直接伪造 assistant 消息。
- [ ] 严重呼吸困难/严重胸痛和即时自伤/伤人线索触发 S。
- [ ] 不触发关键词不被表述为排除急症。
- [ ] 重复 request_id 不重复写入消息。
- [ ] 未配置模型时，普通问答返回明确 503，不生成假答案。
- [ ] 未配置的浏览器 origin 被拒绝。
- [ ] 日志和审计不包含原始健康内容。
- [ ] Critical 用例由具备相应专业能力的人员复核。
