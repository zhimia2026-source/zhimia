# ZHI 个人令牌能力模型 v1

## 原则
- 令牌身份只决定“是谁”；capabilities 决定“可以做什么”。
- 服务端从令牌哈希查得 user_id 和 capabilities；不信任请求体 user_id、role、agent_id 或 capabilities。
- 默认最小权限。未传 capabilities 时，只授予家庭陪伴基础能力。
- 续签凭证保存原能力集合；访问令牌和下一代续签凭证继承该集合，不允许客户端在续签时扩大权限。
- 撤销令牌时，按 family_id 一并撤销该设备的访问与续签凭证。
- 数据库只保存令牌哈希，不保存原始令牌。

## 能力目录

| Capability | 作用 | 当前状态 |
|---|---|---|
| health.chat | 家庭陪伴聊天 | 网关已执行 |
| health.history.read | 读取本人聊天历史 | 网关已执行 |
| health.history.delete | 删除本人聊天历史 | 网关已执行 |
| health.consent.manage | 读取/修改本人聊天保存同意 | 网关已执行 |
| care.read / care.write | 访问本人 CareState | 适配器源码已入库；尚未部署，需通过安全测试 |
| care.approve | 审批本人 Care 动作票据 | 适配器源码已接入独立能力门；尚未部署，需通过审批测试 |
| agent.feed.read | 读取授权智能人的主动消息 | 已登记；接口未开放 |
| broadcast.send | 发起广播 | 已登记；接口未开放 |
| tool.execute | 调用外部工具 | 已登记；监督审批和执行网关未接通 |
| community.scene.discover | 发现公共场景 | 已登记；社区 API 未接通 |
| community.scene.enter | 进入授权场景 | 已登记；社区 API 未接通 |
| community.message.send | 场景内发送消息 | 已登记；社区 API 未接通 |
| agent.profile.read | 读取授权智能人公开资料 | 已登记；社区 API 未接通 |

## 默认权限
新签发令牌默认只获得 `health.chat`、`health.history.read`、`health.consent.manage`。历史删除、Care、工具、广播、场景和主动消息权限均不默认授予。

## Care 身份边界
当前 `zhi-care` 仍要求 Supabase Auth JWT（`verify_jwt=true`），并自行验证用户身份。个人 opaque token 即使被授予 `care.read` 或 `care.write`，也不能直接传给 `zhi-care`。已新增独立源码 `supabase/functions/zhi-care-personal/index.ts`（未部署）：它通过 SHA-256 哈希查验个人令牌、从数据库推导 `user_id`，并按操作分别检查 `care.read`、`care.write`、`care.approve`。正式启用前必须完成静态检查、真实令牌 HTTP 测试、双账号隔离和审批票据测试。原 `zhi-care` 仍保持 `verify_jwt=true`，不能为了个人令牌而关闭其 JWT 验证，也不能让客户端传 `user_id` 冒充身份。

## 验收
- [x] 数据库添加访问令牌与续签凭证能力字段。
- [x] 默认最小权限及数据库能力白名单约束。
- [x] 网关对聊天、历史读取、历史删除、同意管理执行能力检查。
- [x] 续签继承原能力集合。
- [x] 管理员签发接口校验能力名称、数量与重复项。
- [x] 管理员令牌列表返回能力元数据，不返回原始令牌。
- [ ] 真实令牌允许/拒绝路径的端到端 HTTP 测试。
- [x] Care 个人令牌适配器独立源码草案（未部署）。
- [ ] Care 适配器真实令牌 HTTP 测试与双账号隔离测试。
- [ ] 审批票据过期、重复审批、跨账号审批拒绝测试。
- [ ] 聊天前端能力展示/授权交互。
