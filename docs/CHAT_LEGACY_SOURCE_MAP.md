# ZHI 旧聊天主入口源码迁移清单 v0.1

状态：**源码归档已定位；线上版本一致性未验证；尚未迁移部署。**

## 1. 源码范围与边界

本清单依据已上传归档 `ZEE-main.zip` 的静态源码复核，归档时间为 2026-10-17。它可作为旧聊天主入口的迁移基线，但不能证明 GitHub Pages 当前线上文件或 Supabase 已部署函数与归档完全一致。

本阶段只保留现有「智能人讲话室」作为主聊天入口；不迁移或新增独立观察台。页面布局、智能人选择、聊天气泡、历史展示和桌面/移动端交互可复用，但旧身份模型、数据写入路径和高权限功能必须重做。

## 2. 前端调用清单

| 文件 / 模块 | 当前职责 | 迁移处理 |
|---|---|---|
| `agent-talk.html` | 智能人列表、聊天、历史记录、主动消息轮询、全体广播 | 保留聊天 UI；替换认证和 API 适配层 |
| `supabase-client.js` | 配置 Finance 与 Core 两个 Supabase 客户端 | 不直接复用；统一目标项目配置，不混用 JWT |
| `zhi-chat-auth` | 共享页面密码验证并签发 4 小时管理员 HMAC token | 退役；改用个人身份与可撤销令牌 |
| `zhi-agnes-chat` | 单聊模型请求、读取智能人状态/记忆、写入聊天消息/记忆/心智状态 | 先完成数据归并、Agent ownership 和 chat.send 授权，再重建服务端适配器 |
| `zhi-agent-chat-history` | 按 agent_id 读取管理员历史消息 | 退役管理员读取模型；改为当前用户授权会话分页 |
| `zhi-agent-chat-feed` | 读取管理员名下主动消息 | 不得作为普通用户收件箱；未来单独设计 Agent inbox |
| `zhi-agent-broadcast` | 全体广播与逐个决策 | 默认关闭；单独定义范围、审批、幂等和审计后再启用 |

## 3. 旧认证与数据边界（已由归档源码确认）

- 页面通过 `zhi-chat-auth` 提交共享密码；返回的 HMAC 凭证声明 `aud=zhi-chat-admin`、`sub=admin`，有效期 4 小时。
- 浏览器将该凭证放入 `sessionStorage`，并将主动消息已读 ID 与创造者短时在线状态写入 `localStorage`。
- 旧 Core 项目为 `jozrslgdjreepxplicen`；旧 Finance 项目为 `bkttvffunyvbswkxpygp`。目标架构已确定统一使用 `lvxmygrgqtmzqgailmyl`，不得将旧项目 JWT 或服务端密钥迁入浏览器。
- 聊天历史接口从 `admin_agent_messages` 读取；Agent 对话函数读取 `zhi_agents`、`zhi_agent_family`、`zhi_agent_desires`、`zhi_agent_minds`、`zhi_agent_memories`、`admin_agent_messages`、`zhi_agent_world_positions`、`zhi_agent_activities` 等表，并写入记忆、心智和消息记录。
- 旧历史与 feed 函数使用管理员身份验证，不具备个人身份的 Agent 级资源授权。客户端传入 `agent_id` 不能证明其拥有该 Agent。

## 4. 目标接入顺序

1. **只读盘点旧 Core 数据**：核对表、外键、RLS、数据量、用户/Agent 归属、触发器与 RPC；先导出备份并完成恢复演练。
2. **统一身份**：采用目标项目的个人身份凭证；服务端验证令牌后推导 `user_id`，再查询 Agent ownership。不得信任请求体 `user_id`、`agent_id`、role 或 scope。
3. **建立细粒度能力**：至少区分 `chat.read`、`chat.send`、`care.read`、`care.write`、`agent.feed.read`、`broadcast.send`、`tool.execute`。未显式授予的能力一律拒绝。
4. **迁移聊天核心数据**：确认消息、记忆、mind 状态与 Agent 关系的归属模型；私有记忆必须按用户/Agent 严格隔离，不进入社区公共表。
5. **重建聊天 API**：先做只读历史，再做单聊；消息写入与记忆写入要有幂等和失败补偿/事务策略。
6. **Care adapter**：只将获准的结构化证据引用送入 Care；不复制聊天原文，不自动触发行动。Care API 保持独立的 owner、revision、状态机与审批检查。
7. **关闭高风险旧入口**：广播、管理员主动消息 feed、共享密码认证在新路径验收前不得继续暴露给普通用户。
8. **双账号端到端验收**：A/B 用户跨账号读取、伪造 Agent ID、过期/撤销令牌、Care 越权、消息幂等、桌面/移动端回归均通过后才切换线上入口。

## 5. 不可绕过的阻塞项

- 归档源码不是线上部署证明；必须确认 GitHub Pages 实际发布分支/路径和当前线上函数版本。
- 目标 Supabase 项目当前已部署个人令牌体系，但个人令牌表尚无细粒度 scopes/capabilities；在补齐能力模型前，不得将所有有效令牌视为 Care 或聊天全权限凭证。
- 旧聊天数据表尚未证明已归并到目标项目；仅替换 Supabase URL 会造成数据缺失或 API 不匹配。
- Care API 当前只接受目标项目 Supabase Auth JWT（Gateway `verify_jwt=true`）；个人 opaque token 不能直接当作 JWT 转发。
- 当前 GitHub 分支没有旧聊天 HTML/JS 与旧聊天 Edge Functions 的迁移实现；本清单只是源代码映射，不代表迁移或生产接入已完成。

## 6. 验收门槛

- [ ] 线上前端和部署函数与迁移基线逐项比对。
- [ ] 旧 Core 数据备份、映射、导入、校验和回滚演练完成。
- [ ] 个人身份和细粒度 scope 服务端校验完成。
- [ ] Agent ownership 与会话成员授权不能被客户端伪造。
- [ ] Care 证据只保存最小引用，且通过 owner/revision/审批门禁。
- [ ] 双账号隔离、令牌撤销、幂等、并发和桌面/移动端测试通过。
- [ ] GitHub CI、Supabase migration、Edge Function 部署和真实 API 验收全部通过。

