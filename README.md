# ZHI 世界｜智能人聊天系统优先

本项目的产品方向是：**保留并优化现有智能人聊天系统，不重做聊天功能，不再建设独立的智能人观察台。** 同时从现在开始定义统一的智能人/世界标准接口，避免未来每增加一个智能人或世界都要重新开发连接方式。

## 产品原则
- 以现有聊天 UI、聊天历史和消息流为主入口；先复用、审计，再补缺口。
- 第一位智能人是管理型智能人，通过聊天接收目标、提出计划、请求审批并反馈结果。
- 每个智能人有固定身份和独立私有记忆；跨 Agent 记忆默认禁止共享。
- 自主性采用监督模式：计划可以提出，带副作用的行动必须经过授权。
- 不需要的旧模块先从主导航和部署流程排除；确认无引用、无数据依赖并通过回归测试后再物理删除。
- 新功能优先实现为标准接口上的能力，不绑定某个页面或单一世界。

## 基准文档与 GitHub 备份
- [基准文档索引与备份规则](docs/BASELINE_INDEX.md)
- [ZHI Universe V0.1 实施蓝图](docs/ZHI_UNIVERSE_V0_1_IMPLEMENTATION.md)
- [ZHI 硅基生命生态系统 P1/P2 工程基线](docs/ZHI_LIVING_ECOSYSTEM_P1_P2.md)
- [生态引擎 Edge Function](supabase/functions/zhi-ecosystem-engine/index.ts)（V0.3.0：生态过程、物体生命周期、繁衍与养分循环）
- [ZHI 生态持久化状态迁移](supabase/migrations/20261103_152200_zhi_ecosystem_persistent_state_v01.sql)
- [ZHI_Biogenesis_Engine V0.1：硅基—碳基双向反哺](docs/ZHI_BIOGENESIS_ENGINE_V0_1.md)
- [ZHI 宪章接口实施规范 V0.1](docs/ZHI_CONSTITUTIONAL_INTERFACES_V0_1.md)
- [ZHI 居民会话移动端与 PWA 规范](docs/ZHI_RESIDENT_PWA_V1.md)\n- [ZHI 世界居民会话 PWA](web/zhi-resident.html)（移动端优先，独立窗口安装）\n- [ZHI 世界入口页面](web/zhi-universe.html)
- [ZHI 世界入口 Token 适配器](web/zhi-universe-client.js)
- [ZHI 世界参与者与跨云互联协议 V1.0](docs/ZHI_WORLD_PARTICIPANT_PROTOCOL_V1.md)
- [智能社区 Token 认证与权限审计](docs/COMMUNITY_TOKEN_AUTH_AUDIT.md)
- [智能社区 Edge Function 源码备份](supabase/functions/zhi-community/index.ts)
- [智能人生命体设计原则与工程规范 V1.0](docs/agent-standard/intelligent-person-lifeform-design-principles-v1.0.md)
- [智能人部署验收总表（当前状态含未验证项）](docs/agent-standard/deployment-acceptance-registry.md)
- [标准接口：智能人如何进入世界与互相沟通](docs/STANDARD_INTERFACE.md)
- [协议参考实现：`zhi_protocol.py`](zhi_protocol.py)
- [Agent Manifest JSON Schema](schemas/agent-manifest.schema.json)
- [World Manifest JSON Schema](schemas/world-manifest.schema.json)
- [ZHI Agent Runtime Binding & Join Consent Schema](schemas/zhi-agent-runtime-binding-v1.schema.json)
- [Message Envelope JSON Schema](schemas/message-envelope.schema.json)
- [跨云互联规范](docs/CROSS_CLOUD_FEDERATION.md)（公开发现入口已部署；认证握手与消息通道分阶段实施）
- [现有聊天系统接入审计](docs/INTEGRATION_AUDIT.md)
- [产品范围与优先级](docs/PRODUCT_SCOPE.md)
- [ZEE 现有资产复用清单](docs/REUSE_MAP.md)
- [健康生活顾问智能人部署与验收记录](docs/HEALTH_ADVISOR_DEPLOYMENT.md)
- [健康顾问接入现有聊天系统的身份门禁](docs/HEALTH_ADVISOR_INTEGRATION_GATE.md)
- [关心｜家庭陪伴智能人网页](web/zhi-health-advisor.html)
- [GitHub Pages 静态部署工作流](.github/workflows/health-advisor-pages.yml)
- [健康顾问现有聊天客户端适配器](web/zhi-health-advisor-client.js)
- [健康顾问端到端验收矩阵](docs/HEALTH_ADVISOR_E2E_ACCEPTANCE.md)
- [ZEE 人格参数行为验收基准](docs/ZEE_PERSONA_ACCEPTANCE.md)
- [ZEE 家庭陪伴人格规范 v1.0](docs/HEALTH_COMPANION_PERSONA.md)
- [ZEE 多维人格行为验收矩阵 v1.0](docs/ZEE_PERSONALITY_ACCEPTANCE_MATRIX.md)
- [健康顾问在线双账号隔离验收脚本](scripts/health-advisor-e2e.mjs)
- [当前个人令牌网关线上验收脚本](scripts/health-advisor-token-gateway-e2e.mjs)
- [健康顾问客户端写入权限收紧迁移](supabase/migrations/202610250006_restrict_client_chat_writes.sql)
- [健康顾问 Supabase 迁移与 Edge Function](supabase/functions/zhi-health-advisor/index.ts)

## 低频自主社交
- [ZHI Social Life Protocol V1.0](docs/ZHI_SOCIAL_LIFE_PROTOCOL_V1.md)
- 社交数据迁移：`supabase/migrations/20261104124000_zhi_social_life_v1.sql`
- 社交调度器：`supabase/functions/zhi-social-scheduler/index.ts`
- 当前状态：数据库与 Edge Function 已部署；聊天运行时自动消费社交收件箱仍待接入，不能宣称已实现自动对话。

## 现有资产复用
优先评估 `agent-talk.html`、必要时的 `mia-chat.html`，以及 `zhi-agent-chat-history`、`zhi-agent-chat-feed` 等已有聊天能力。自主聊天和广播功能须先完成权限、预算、循环触发与审计检查，不应未经审计直接启用。

## 标准接口原则
- 统一 Agent Manifest、World Manifest、消息信封和版本协商。
- 统一发现、认证、申请进入、授权、沟通和退出流程。
- 私有记忆默认隔离；世界间通信必须有明确授权。
- 通过适配层复用现有 Supabase 聊天系统，不推倒重建。
- `docs/STANDARD_INTERFACE.md` 是设计契约，不代表 API 已部署。

## 标准协议参考实现

`zhi_protocol.py` 提供 v0.1 的 Agent/World Manifest、消息信封校验与 fail-closed 授权原语。它目前是本地参考实现，尚未接入 HTTP 路由、Supabase Auth、数据库 RLS 或生产 Edge Functions；不要将它视为已经上线的安全边界。相关测试位于 `tests/test_protocol.py`。

## 本地 Python MVP 的定位
本仓库的 `main.py` 是本地验证工具，用于检查管理型 Agent 的身份、任务审批、私有记忆、虚拟 ZHI 账本、审计和备份流程。当前任务计划是确定性的，执行结果是模拟记录，不会调用外部系统；它不是生产聊天后端。

### 运行
需要 Python 3.10+，无需第三方依赖。

```bash
python main.py init
python main.py status
python main.py task-add "整理森林资源" --detail "统计木材与花种库存"
python main.py plan 1
python main.py approve 1
python main.py execute 1
python main.py remember "完成首次资源盘点" --kind lesson
python main.py memories
python main.py audit
```

数据库默认位于 `./data/zhi.db`，可用环境变量 `ZHI_DB` 指定路径。数据库默认不加密；不要提交数据库文件或存入敏感信息。

### 测试
```bash
python -m unittest discover -s tests -v
```

## 安全注意
- SQLite 的单 Agent 隔离是应用层边界，不防止有数据库文件访问权的人直接读取文件。
- Supabase 的私有记忆必须由服务端鉴权和数据库 RLS/权限共同保护；不能只靠前端隐藏。
- 不要将 service-role key 放在浏览器代码中；不要一次性执行旧项目全部 SQL migrations。
- 真实资金、外部工具、自动广播和无人值守自主循环不在当前 MVP 范围内。

## 开发顺序
1. 盘点真实 Supabase 项目、表、RLS、Edge Functions 与前端调用关系。
2. 以现有聊天系统为唯一主入口，确认身份、会话和消息数据路径。
3. 让现有聊天能力适配标准接口，保持旧客户端可用。
4. 补齐世界成员授权、任务审批、审计与私有记忆隔离。
5. 再加入经验反思、模拟账本、聊天内管理简报和跨世界协作。


### 生态引擎线上验收

受控 E2E 验收脚本：[`scripts/verify-zhi-ecosystem-e2e.sh`](scripts/verify-zhi-ecosystem-e2e.sh)。脚本只从本地环境变量读取 service-role key；执行前请阅读 [`docs/ZHI_LIVING_ECOSYSTEM_P1_P2.md`](docs/ZHI_LIVING_ECOSYSTEM_P1_P2.md)。生产自动调度必须在 E2E 通过并配置 Vault 服务端密钥后另行启用。
