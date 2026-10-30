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
- [智能人生命体设计原则与工程规范 V1.0](docs/agent-standard/intelligent-person-lifeform-design-principles-v1.0.md)
- [智能人部署验收总表（当前状态含未验证项）](docs/agent-standard/deployment-acceptance-registry.md)
- [标准接口：智能人如何进入世界与互相沟通](docs/STANDARD_INTERFACE.md)
- [协议参考实现：`zhi_protocol.py`](zhi_protocol.py)
- [Agent Manifest JSON Schema](schemas/agent-manifest.schema.json)
- [World Manifest JSON Schema](schemas/world-manifest.schema.json)
- [Message Envelope JSON Schema](schemas/message-envelope.schema.json)
- [跨云互联规范](docs/CROSS_CLOUD_FEDERATION.md)
- [任务执行与可信回执协议](docs/TASK_EXECUTION_PROTOCOL.md)
- [智能社区 MVP 实现契约](docs/COMMUNITY_MVP.md)
- [智能社区浏览器入口源码](web/zhi-community.html)、[个人令牌能力管理页](web/zhi-token-admin.html)（功能分支，待 PR 合并发布）
- [智能社区 API 与安全审查](docs/COMMUNITY_API.md)、[数据模型](docs/COMMUNITY_SCHEMA_DESIGN.md)、[安全审查](docs/COMMUNITY_SECURITY_REVIEW.md)
- [聊天主入口接入契约](docs/CHAT_ADAPTER_CONTRACT.md)
- [聊天接入部署审计补充](docs/CHAT_DEPLOYMENT_AUDIT.md)
- [单一 Supabase 项目部署与数据归并方案](docs/SUPABASE_SINGLE_PROJECT_PLAN.md)
- [关心机制规范与 API](docs/CARE_MECHANISM.md)、[CARE API](docs/CARE_API.md)、[聊天接入契约](docs/CARE_CHAT_INTEGRATION.md)
- [个人令牌能力模型](docs/PERSONAL_TOKEN_CAPABILITIES.md)
- [关心机制数据库迁移与 Edge Function](supabase/migrations/20261028120000_zhi_care_states.sql)、[zhi-care](supabase/functions/zhi-care/index.ts)、[zhi-care-personal 适配器源码](supabase/functions/zhi-care-personal/index.ts)
- [关心机制 Python 参考实现与测试](zhi_care.py)、[持久化适配器](zhi_care_repository.py)、[测试](tests/test_care.py)
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

## 现有资产复用
优先评估 `agent-talk.html`、必要时的 `mia-chat.html`，以及 `zhi-agent-chat-history`、`zhi-agent-chat-feed` 等已有聊天能力。已审计的旧聊天页面仍有共享页面密码认证、全体广播和管理型主动消息轮询等风险，不能未经身份改造和资源级授权直接接入。自主聊天和广播功能须先完成权限、预算、循环触发与审计检查。

## 数据库统一部署原则

ZHI 内部数据库、认证、Edge Functions、Storage 与 Realtime 按当前决策统一使用 `https://lvxmygrgqtmzqgailmyl.supabase.co`。跨云参与者仍保留各自的模型、数据库、记忆和运行环境。旧聊天源码原先指向其他项目，必须先完成数据、函数、身份和客户端迁移验收，不能只替换 URL 后切换生产流量。

## 身份接入当前状态

Supabase 已有个人令牌、续签凭证和能力模型。Care 个人令牌适配器目前只有仓库源码，尚未部署；已部署的 `zhi-care` 仍是 JWT-only。旧聊天 Core 归并、聊天资源级授权、个人令牌 HTTP 验证和跨账号端到端隔离尚未全部完成。跨项目身份断言桥接仅保留为历史设计。

## 标准接口原则
- 统一 Agent Manifest、World Manifest、消息信封和版本协商。
- 统一发现、认证、申请进入、授权、沟通和退出流程。
- 私有记忆默认隔离；世界间通信必须有明确授权。
- 通过适配层复用现有 Supabase 聊天系统，不推倒重建。
- `docs/STANDARD_INTERFACE.md` 是设计契约，不代表 API 已部署。

## 标准协议参考实现

`zhi_protocol.py` 提供 v0.1 的 Agent/World Manifest、消息信封校验与 fail-closed 授权原语。它目前是本地参考实现，尚未接入 HTTP 路由、Supabase Auth、数据库 RLS 或生产 Edge Functions；不要将它视为已经上线的安全边界。相关测试位于 `tests/test_protocol.py`。

## 关心机制参考实现与当前限制

`zhi_care.py` 和 `zhi_care_repository.py` 提供本地状态机与 SQLite 参考实现，不是生产安全边界。Supabase 上的 Care 私有表与 JWT Edge Function 已部署；审批票据和原子审计 RPC 已部署并通过数据库测试。个人令牌适配器尚未部署，Care 也尚未接入现有聊天 UI。SQLite 数据库默认不加密。

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
2. 以现有聊天系统为唯一主入口，完成身份、会话和消息数据路径审计。
3. 让现有聊天能力适配标准接口，保持旧客户端可用。
4. 补齐世界成员授权、任务审批、审计与私有记忆隔离。
5. 完成个人令牌 HTTP 验证、撤销/能力门禁和跨账号隔离验收，再部署独立 Care 适配器。
6. 将 Care 机制接入聊天主入口，确保对话证据最小化、用户同意和审批流程闭环。
7. 完成执行授权票据、可信回执和恢复流程，再进行跨云双端互操作验证。
8. 再加入经验反思、模拟账本、聊天内管理简报和跨世界协作。


### 场景环境状态引擎

场景时区、昼夜节律、事件潮汐、环境声光、物件微状态与行为权重的按需计算实现见 [场景环境 API 与配置契约](docs/COMMUNITY_API.md#场景环境状态引擎新增实现)。
