# ZHI 聊天接入现状审计补充（基于已部署 Supabase 与上传源码）

日期：2026-10-28
状态：只读审计结果 / 旧聊天系统归并尚未完成。\n\n**架构决定更新（2026-10-28）：** 用户已明确要求 ZHI 的所有数据库统一使用 `https://lvxmygrgqtmzqgailmyl.supabase.co`。本文件中有关“部署跨项目身份断言桥接”的旧建议已被取代；应将聊天 Core 数据、表、函数和客户端配置迁移/归并到目标项目。具体步骤见 [单一 Supabase 项目部署与数据归并方案](SUPABASE_SINGLE_PROJECT_PLAN.md)。

## 1. 已确认的部署现状

已读取 Supabase 项目 `lvxmygrgqtmzqgailmyl` 的表结构与 Edge Function 元数据：

- `zhi-token-gateway`：ACTIVE，当前部署版本 12，`verify_jwt=false`；函数内部从 Bearer token 的 SHA-256 哈希查找 `zhi_personal_access_tokens`，拒绝已撤销/已过期令牌，并更新时间戳。
- `zhi-token-admin`：ACTIVE，当前部署版本 10，`verify_jwt=false`；使用 Supabase Auth 的 GitHub 登录用户校验管理员身份，支持令牌列表、撤销和签发。
- `zhi-care`：ACTIVE，当前部署版本 6，`verify_jwt=true`。
- `zhi_personal_access_tokens`：启用 RLS，存储 token_hash、user_id、expires_at、revoked_at、last_used_at、family_id 等字段；注释声明只存哈希。
- `zhi_refresh_credentials`：启用 RLS，存储续签凭证哈希、用户、设备凭证族、到期、轮换与撤销状态。
- `zhi_care_states`、`zhi_care_events`、`zhi_care_approval_tickets`：均启用 RLS，并通过 user_id 与 auth.users 关联。

以上只证明部署元数据和表结构存在，不等于所有流程已经端到端验收。未读取、输出或保存任何原始个人令牌。

## 2. 聊天旧系统静态审计确认

在用户上传的 `ZEE-main.zip` 中检查了以下文件：

- `supabase/functions/zhi-chat-auth/index.ts`
- `supabase/functions/zhi-agent-chat-history/index.ts`
- `supabase/functions/zhi-agent-chat-feed/index.ts`
- `supabase-client.js`

观察结果：

1. `zhi-chat-auth` 通过 `zhi_verify_chat_password` 验证共享页面密码，签发 `aud=zhi-chat-admin`、`sub=admin` 的 4 小时 HMAC token。
2. 历史与主动消息 feed 的旧函数优先验证上述管理员 token，也兼容一个固定管理员 Supabase 用户；它们不是普通个人身份的 Agent 级授权 API。
3. 历史 API 从请求体接收 `agent_id`，旧授权模型是管理员身份而不是按普通用户拥有的 Agent/会话范围逐条授权。
4. feed 查询固定管理员名下、带特定前缀的主动消息。这不是面向每个个人身份的收件箱。
5. 上传版本 `supabase-client.js` 说明 Core 与 Finance 是不同 Supabase 项目，不能假定 Finance 的 JWT 可直接当作 Core JWT。

这些结论仅针对上传的 ZIP 源码。尚未证明它与 GitHub 当前默认分支或线上实际部署代码完全一致。

## 3. 当前真正的接入缺口

已部署的 `zhi-token-gateway` 能将个人 Bearer token 解析到 `zhi_personal_access_tokens.user_id`，但其业务操作目前是健康顾问对话、同意状态和健康对话历史。它没有提供经过定义、面向聊天 Core 的身份断言交换契约。

不得采取以下捷径：

- 不要将 `zhi-chat-admin` token 当作个人身份 token。
- 不要将 `zhi-care` 的 JWT 验证开启状态理解为它自动接受另一个 Supabase 项目的 JWT。
- 不要仅把客户端传入的 `user_id` 或 `agent_id` 作为身份/归属证明。
- 不要把 service-role key、HMAC 签名密钥或管理员 token 放进浏览器。
- 不要因聊天授权成功就默认授予 CareState 读写、私有记忆读取、广播或工具执行权限。

## 4. 目标架构下的实现顺序（替代原跨项目桥接方案）

### A. 定义身份断言交换

优先考虑由身份所在项目的服务端验证个人令牌，再生成短时、单次、受众限定的身份断言，供聊天 Core 的服务端验证。断言至少绑定：

- issuer（签发方项目）
- audience（唯一目标服务）
- subject（经过验证的 auth user UUID）
- issued-at / expiry（短时有效）
- jti（一次性标识）
- requested capability / scope（最小能力）
- 可选的目标 Agent 或会话范围

断言签名密钥必须由服务端 secret 管理，并在两个项目间显式配置；采用非对称签名时，Core 只持有公钥。必须验证签名、issuer、audience、时间窗口、撤销策略和 jti 重放。不能只 Base64 解码 JWT 或信任未验证的 claims。

### B. Core 侧按资源再次授权

Core 收到断言后，仍需检查 subject 是否有权访问指定 Agent、会话、历史和收件箱。断言只证明身份与限定能力，不自动证明目标资源归属。

### C. Care API 使用独立的受控桥接

聊天服务调用 Care API 时，使用明确的服务端身份桥接，并在每次调用中传递可验证的最终用户主体和目标资源。Care API 必须再次执行 owner、revision、状态机和审批票据检查。禁止将用户个人 token 直接跨项目转发并假设它是目标项目的 JWT。

### D. 渐进式接入

先实现并测试只读的身份验证/授权检查，再接聊天发送和历史读取；最后才考虑主动消息、广播或工具调用。任何阶段失败都必须保留旧入口或回滚，不在未验收时替换生产页面。

## 5. 必须通过的测试

- 无 token、格式错误、未知 token、过期 token、撤销 token均拒绝。
- token A 不能读取 token B 的 Agent、会话、历史、CareState 或私有记忆。
- 客户端伪造 user_id、agent_id、scope 或 audience 不能扩大权限。
- 将另一 Supabase 项目的 JWT 直接提交给目标服务必须拒绝，除非走明确的断言交换。
- 断言过期、错误 issuer/audience、错误签名、重复 jti 均拒绝。
- 并发重复请求不应造成重复审批消费、重复执行或绕过 revision。
- 撤销后请求按约定失效；短期会话最大存活时间必须有明确上限。
- 日志不含原始 token、refresh token、完整消息正文或私有记忆内容。

## 6. 仍未完成的验证

- 尚未对聊天旧函数执行部署状态核对；上传源码不能替代线上函数源码。
- 聊天 Core 尚未归并到统一目标项目。
- 尚未运行有效个人令牌的真实聊天 API 请求。
- 尚未完成跨账号隔离、撤销即时性、断言重放、并发与端到端测试。
- 不应将本审计描述为聊天系统已完成安全接入。
