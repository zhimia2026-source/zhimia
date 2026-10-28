# ZHI 世界基准文档索引与备份规则

**用途：** 本文件是 ZHI 世界项目当前基准文档的 GitHub 索引。以下文件均以本仓库 `main` 分支中的版本为准。

## 当前基准文档

1. [产品范围与验收标准](PRODUCT_SCOPE.md) — 产品边界、优先级、验收条件。
2. [现有资产复用清单](REUSE_MAP.md) — 旧系统页面、Edge Functions、数据库迁移的复用与审计要求。
3. [标准接口设计](STANDARD_INTERFACE.md) — Agent、World、消息格式、协议版本及接入流程。
4. [跨云互联规范](CROSS_CLOUD_FEDERATION.md) — 跨云身份、授权、通信、撤销和安全边界。
5. [现有聊天系统接入审计](INTEGRATION_AUDIT.md) — 基于上传源码的静态初审和接入前置条件。
6. [健康生活顾问智能人部署与验收记录](HEALTH_ADVISOR_DEPLOYMENT.md) — Supabase 迁移、Edge Function、已知限制和上线门禁。
7. [智能人生命体设计原则与工程规范 V1.0](agent-standard/intelligent-person-lifeform-design-principles-v1.0.md) — 身份、记忆、决策、自主权、进化治理与验收原则。\n8. [智能人部署验收总表](agent-standard/deployment-acceptance-registry.md) — 按智能人登记测试证据、阻塞项、版本和发布决定。\n9. [项目总览 README](../README.md) — 产品原则、开发顺序、本地 MVP 定位及安全提醒。

## 功能分支中的扩展提案

- [聊天主入口接入契约](CHAT_ADAPTER_CONTRACT.md) — 独立身份、聊天/历史/关心状态权限与验收清单；尚未完成前后端集成。
- [聊天接入部署审计补充](CHAT_DEPLOYMENT_AUDIT.md) — 基于当前 Supabase 部署元数据、表结构和上传聊天源码的现状审计；旧聊天 Core 归并和端到端测试仍未完成。
- [单一 Supabase 项目部署与数据归并方案](SUPABASE_SINGLE_PROJECT_PLAN.md) — 统一使用 `lvxmygrgqtmzqgailmyl`，定义旧聊天数据库、函数、身份映射、数据迁移、验收与回滚步骤。
- [智能社区核心数据模型草案](COMMUNITY_SCHEMA_DESIGN.md) — Agent、场景、成员关系、会话、消息与环境事件的最小模型和安全不变量；仅为设计草案，尚未部署。
- [智能社区数据库迁移草案](../supabase/migrations/20261028140000_zhi_community_core.sql) — 8 张社区核心表、约束、索引、RLS 与服务端专用 grants；已提交功能分支，**未应用到 Supabase**，需先在隔离环境验证并审查 API 授权。
- [智能社区 Edge Function](../supabase/functions/zhi-community/index.ts) — 使用现有个人访问令牌的 SHA-256 哈希进行服务端认证；当前实现公共场景发现/创建/加入及成员消息读写。私人邀请兑换与审批流程明确拒绝，尚未部署或端到端测试；部署时须确认 Supabase Gateway 不会把自定义个人令牌误当作 Supabase Auth JWT。
- [旧跨项目身份断言桥接契约](IDENTITY_ASSERTION_BRIDGE.md) — 已被单一 Supabase 项目架构取代，仅保留为历史设计记录，不作为目标实现方案。
- [关心机制规范 V1.0](CARE_MECHANISM.md) — 跨本体认知—价值—行动机制；当前为实现草案，须经评审和测试后才能纳入稳定基准。
- [关心机制参考实现](../zhi_care.py) 与 [单元测试](../tests/test_care.py)。
- [关心机制 SQLite 持久化适配器](../zhi_care_repository.py) 与 [持久化/隔离测试](../tests/test_care_repository.py)。
- [关心机制 Supabase API](CARE_API.md)、[数据库迁移](../supabase/migrations/20261028120000_zhi_care_states.sql)、[Edge Function](../supabase/functions/zhi-care/index.ts) 与 [真实 API 冒烟测试脚本](../scripts/smoke_test_zhi_care.py)。Supabase 端已部署参考 API，但尚未通过端到端验收。


## 不可变设计原则

- **统一协议，不统一部署。** 各参与方保留自己的模型、数据库、私有记忆和运行环境。
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
- 目前标准接口和跨云互联文件属于设计基线；在实际实现和验证前，不得描述为已部署能力。
