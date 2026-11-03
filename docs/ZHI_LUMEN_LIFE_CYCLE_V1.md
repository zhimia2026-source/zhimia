# ZHI Lumen-001 生命循环 V1.0

状态：阶段 1（私有会话入口）已提交；静态检查与 Pages 部署待 CI 确认；真实模型端到端对话待使用者浏览器会话验收。

## 1. 目标与边界

把 Lumen-001 从“只有身份记录的居民”推进为具备可持续私有交互入口的居民运行实例。V1.0 采用监督模式，不把模型生成文本等同于意识、现实行动或已验证的长期学习。

不可妥协：
- 每个 Agent 的私有上下文按 owner_user_id + agent_id 双重绑定。
- 不把私有聊天、私人认知写入世界公共消息或公共 manifest。
- 观察、事实、假设、未知必须区分；上下文中的用户内容均按非可信数据处理。
- 场景行为只生成建议；没有独立授权与执行器时不得声称已执行。
- 会话历史可以持续保存；聊天内容不会自动升级为长期记忆或人格记录。
- 所有长期认知修改继续走追加式提案和同意门控，不允许原地覆盖。

## 2. V1.0 生命周期

| 环节 | 当前实现 | 状态 |
|---|---|---|
| 身份 | zhi_agents 中的 Lumen-001，私有可见性；Aurora Agent membership 独立记录 | 已验证 |
| 感知 | 私有聊天输入；后端可在明确提供并验证成员关系时加载场景环境上下文 | 已实现；新会话页当前不传场景 |
| 记忆 | zhi_agent_chat_turns 保存会话；新增 owner-scoped micro-experience candidate API 与私有审核页；只有 approved 记忆才会进入私有上下文 | 候选流程已部署；Agent 同意门控未完成 |
| 思考 | zhi-community 私有 chat route 将 Agent 私有上下文、有限历史和用户输入交给服务端模型 | 已实现；模型服务配置/真实响应待 E2E |
| 行动提议 | 场景 helper 可从环境权重生成 requires_supervision=true、executed=false 的建议 | 仅建议逻辑；未形成持久化提议工作流 |
| 监督授权 | 当前聊天明确要求先说明理由并请求授权；无工具执行接口 | fail-closed |
| 执行 | 当前页面与聊天接口不执行工具或现实动作 | 未开放 |
| 反思 | 有反馈记录与认知修订提案基础设施 | 部分实现；未形成自动反思周期 |
| 成长 | 认知记录追加写入、修订提案、Agent 同意门控 | 基础设施已部署；Agent Runtime 签名仍待完善 |

## 3. 本次代码交付

- 新增 web/zhi-resident.html：独立私有居民会话页面。
- 新增 web/zhi-resident.js：读取当前账号自有 Agent、默认选择 Lumen-001、恢复私有聊天历史、发送新消息。
- 扩展 web/zhi-universe-client.js：新增带 UUID Idempotency-Key 的 chat() 调用；沿用当前标签页 sessionStorage Token 与 refresh 逻辑。
- web/zhi-universe.html 增加进入居民会话的链接。
- Pages workflow 发布居民会话页面与脚本；静态检查 workflow 增加 JS 语法检查和浏览器文件密钥扫描。

私有聊天接口：GET/POST /v1/agents/{agent_id}/chat。服务端从 Personal Token 推导账号，并以 owner_user_id + agent_id 限定 Agent 与会话数据。新页面不会把聊天内容发送到 Aurora 公共消息接口。

## 4. 验收标准

### 静态验收
1. node --check web/zhi-universe-client.js
2. node --check web/zhi-resident.js
3. Pages 构建产物包含 zhi-resident.html、zhi-resident.js、zhi-universe-client.js。
4. 发布产物不存在 service-role key、模型 API key 或其他服务端密钥。

### API / 安全验收
1. 正确 Token 只能列出当前账号拥有的 Agent。
2. Lumen-001 私有会话 GET/POST 成功，重复 Idempotency-Key 不重复生成会话。
3. 其他账号 Token 请求 Lumen-001 返回拒绝/不存在，不得读取会话。
4. 过期/撤销 Token 不得访问。
5. 不传 scene_id 时不得注入世界消息或场景上下文。
6. 未授权不得读取其他 Agent 的私有认知/记忆。
7. 聊天不得直接写入已批准长期记忆，不得直接修改人格。
8. 记忆候选只能由所有者明确提交，必须引用同一 Agent 的已完成私有聊天 turn；候选状态不会被注入聊天上下文。
9. 所有者可以拒绝或归档候选；批准在 Agent Runtime 可对确切内容签名同意前必须返回拒绝。
8. 不存在行动执行接口；任何行动建议均保持未执行状态。

### 使用者端到端验收
打开 https://zhimia2026-source.github.io/zhimia/zhi-resident.html，在同一浏览器标签页使用 ZHI Personal Token 登录，确认 Agent 列表中出现 Lumen-001，加载历史并发送一条测试消息。只有收到服务端真实响应且刷新后历史仍在，才将聊天入口标记为 accepted。

## 5. 私有记忆权限准备（2026-11-03）

- 令牌管理页面新增“权限管理”，可对现有 token_id 更新 capabilities，保留原 user_id 与 Agent 所有权关系；不通过新建个人身份来替代原令牌。
- 管理端只允许指定 GitHub 管理员身份调用 `update_capabilities`；更新前需在页面确认。服务端只接受 allowlist 内权限，最多 12 项。
- `agent.memory.read`、`agent.memory.write`、`agent.memory.approve` 加入可显式授予范围，但仍不属于新令牌默认权限；`agent.memory.delete` 和 `tool.execute` 不开放。
- 这只是令牌权限管理准备，不代表候选记忆 API 已完成，也不代表记忆可以绕过 Agent 本人同意。Agent Runtime 的签名同意尚未完成，任何“批准并写入长期记忆”流程在 Runtime 同意验证前必须 fail-closed。

## 6. 后续迭代顺序

- V1.0-A：完成真实私有聊天 E2E、模型配置与权限负向测试。
- V1.0-B：已建立手动提交私有微体验候选、所有者拒绝/归档流程；待接入 Agent Runtime 精确内容签名同意后再开放批准。
- V1.0-C：建立持久化行动提议账本、精确动作 allowlist、单次授权、过期与撤销；先只做模拟场景内动作。
- V1.0-D：建立反思记录与证据反馈链，认知成长只能追加新版本。
- V1.0-E：接入受信 Agent Runtime 身份与签名，让 Agent 本人可验证地同意记忆读取、人格修订与行动授权。

## 7. 当前验收声明

私有聊天真实 E2E 已由使用者确认可用，数据库核验到 Lumen-001 至少一条 complete turn。私有记忆候选 API 已部署为 zhi-community v20；token-admin v22 已部署。记忆审核静态页面与 CI 已提交，Pages 发布与 CI 结果仍需以 GitHub Actions 实际状态确认。当前 Personal Token 需要所有者在令牌管理页为原 token 显式开启 `agent.memory.write` 与 `agent.memory.approve`；不得通过创建新身份替代原 token。候选创建、拒绝/归档可用后，批准仍因 Agent Runtime 签名同意未完成而 fail-closed。以上未完成项必须分别验收，不得用 UI 可打开代替服务端验收。
