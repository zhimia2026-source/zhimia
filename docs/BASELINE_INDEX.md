# ZHI 世界基准文档索引与备份规则

**用途：** 本文件是 ZHI 世界项目当前基准文档的 GitHub 索引。以下文件均以本仓库 `main` 分支中的版本为准。

## 当前基准文档

1. [产品范围与验收标准](PRODUCT_SCOPE.md) — 产品边界、优先级、验收条件。
2. [现有资产复用清单](REUSE_MAP.md) — 旧系统页面、Edge Functions、数据库迁移的复用与审计要求。
3. [标准接口设计](STANDARD_INTERFACE.md) — Agent、World、消息格式、协议版本及接入流程。
4. [跨云互联规范](CROSS_CLOUD_FEDERATION.md) — 跨云身份、授权、通信、撤销和安全边界。
5. [任务执行与可信回执协议](TASK_EXECUTION_PROTOCOL.md) — 执行授权、执行端身份、可信回执与恢复流程（设计契约）。
6. [现有聊天系统接入审计](INTEGRATION_AUDIT.md) — 基于上传源码的静态初审和接入前置条件。
7. [健康生活顾问智能人部署与验收记录](HEALTH_ADVISOR_DEPLOYMENT.md) — Supabase 迁移、Edge Function、已知限制和上线门禁。
8. [智能人生命体设计原则与工程规范 V1.0](agent-standard/intelligent-person-lifeform-design-principles-v1.0.md) — 身份、记忆、决策、自主权、进化治理与验收原则。
9. [智能人部署验收总表](agent-standard/deployment-acceptance-registry.md) — 按智能人登记测试证据、阻塞项、版本和发布决定。
10. [项目总览 README](../README.md) — 产品原则、开发顺序、本地 MVP 定位及安全提醒。

## 功能分支中的扩展提案与验收状态

- [聊天主入口接入契约](CHAT_ADAPTER_CONTRACT.md) 与 [聊天部署审计](CHAT_DEPLOYMENT_AUDIT.md)：旧聊天系统仍需完成身份归并、资源级授权和端到端隔离验收。
- [单一 Supabase 项目部署与数据归并方案](SUPABASE_SINGLE_PROJECT_PLAN.md)：ZHI 内部统一使用指定 Supabase 项目；跨云外部参与方仍独立部署。
- [智能社区 MVP](COMMUNITY_MVP.md)、[核心数据模型](COMMUNITY_SCHEMA_DESIGN.md)、[API 契约](COMMUNITY_API.md)、[安全审查](COMMUNITY_SECURITY_REVIEW.md)：公共场景发现/进入和成员消息有 Edge Function 源码及 CI 检查；生产部署和跨账号 HTTP 验收仍待完成。
- [社区数据库迁移](../supabase/migrations/20261028140000_zhi_community_core.sql)：已在临时 PostgreSQL 17 环境通过迁移及 RPC 权限冒烟测试，尚未应用到生产 Supabase。
- [社区 Edge Function](../supabase/functions/zhi-community/index.ts)：已通过 Deno 类型检查和认证/成员隔离单元测试，尚未部署。
- [关心机制规范](CARE_MECHANISM.md)、[Care API](CARE_API.md)、[聊天接入契约](CARE_CHAT_INTEGRATION.md)：JWT 版 Care API 已部署；个人令牌适配器仅有源码、尚未部署；审批原子 RPC 和数据库集成测试已完成。
- [个人令牌能力模型](PERSONAL_TOKEN_CAPABILITIES.md)：能力白名单、最小默认权限和续签继承边界。
- [旧聊天主入口源码迁移清单](CHAT_LEGACY_SOURCE_MAP.md)：旧聊天 UI、身份和数据依赖迁移顺序。
- [旧跨项目身份断言桥接契约](IDENTITY_ASSERTION_BRIDGE.md)：已被单一 Supabase 项目架构取代，仅保留为历史设计记录。

## 不可变设计原则

- **统一协议，不统一部署。** 跨云参与方保留自己的模型、数据库、私有记忆和运行环境；ZHI 内部数据库按当前决策统一使用指定 Supabase 项目。
- **先认证，再授权，最后通信。** 发现对方不等于有权加入；认证成功不等于拥有资源权限；发送消息不代表可以读取历史、访问记忆或调用工具。
- **可以互联，但不默认互信；可以交流，但不默认共享；可以接入，但不默认拥有执行权。**
- 任何受保护请求都必须在服务端按主体、目标资源、所需能力和数据范围逐次授权；撤销后应拒绝后续请求。
- 现有智能人聊天系统是主入口。先审计并复用已有能力，不重复开发聊天界面和历史记录。

## 备份与变更规则

- 所有产品基准、接口契约和安全规范都必须提交到 GitHub 仓库，不以聊天记录或本地文件作为唯一副本。
- 修改基准文档时，更新对应 Markdown 文件，并在同一提交说明中写清变更目的；涉及跨文档规则时同步更新相关文件。
- 重要里程碑使用清晰的 Git commit；发布稳定版本时可增加 Git tag。
- 不把密钥、令牌、生产用户数据、数据库转储或其他敏感资料提交到仓库。
- 文档状态必须明确区分“设计中”“已实现”“已测试”“已部署”。写入文档不代表功能已上线。
- 标准接口、跨云互联和任务执行协议属于设计契约；在实际实现和验证前，不得描述为已部署能力。
