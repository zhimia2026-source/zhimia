# ZHI 世界｜智能人聊天系统优先

本项目的产品方向是：**保留并优化现有智能人聊天系统，不重做聊天功能，不再建设独立的智能人观察台。** 同时定义统一的智能人/世界标准接口，避免每增加一个智能人或世界都要重新开发连接方式。

## 产品原则
- 以现有聊天 UI、聊天历史和消息流为主入口；先复用、审计，再补缺口。
- 第一位智能人是管理型智能人，通过聊天接收目标、提出计划、请求审批并反馈结果。
- 每个智能人有固定身份和独立私有记忆；跨 Agent 记忆默认禁止共享。
- 自主性采用监督模式：计划可以提出，带副作用的行动必须经过授权。
- 不需要的旧模块先从主导航和部署流程排除；确认无引用、无数据依赖并通过回归测试后再物理删除。
- 新功能优先实现为标准接口上的能力，不绑定某个页面或单一世界。

## 基准文档与 GitHub 备份
- [基准文档索引与备份规则](docs/BASELINE_INDEX.md)
- [标准接口：智能人如何进入世界与互相沟通](docs/STANDARD_INTERFACE.md)
- [协议参考实现：zhi_protocol.py](zhi_protocol.py)
- [跨云互联规范](docs/CROSS_CLOUD_FEDERATION.md)
- [任务执行与可信回执协议](docs/TASK_EXECUTION_PROTOCOL.md)
- [智能社区 MVP 实现契约](docs/COMMUNITY_MVP.md)
- [关心机制规范 V1.0（实现草案）](docs/CARE_MECHANISM.md)
- [关心机制 Supabase API](docs/CARE_API.md)
- [真实 API 冒烟测试脚本](scripts/smoke_test_zhi_care.py)
- [关心机制数据库迁移](supabase/migrations/20261028120000_zhi_care_states.sql)
- [关心机制 Edge Function](supabase/functions/zhi-care/index.ts)
- [关心机制 Python 参考实现](zhi_care.py)
- [关心机制 SQLite 持久化适配器](zhi_care_repository.py)
- [关心机制单元测试](tests/test_care.py)
- [关心机制持久化与隔离测试](tests/test_care_repository.py)

## 现有资产复用
优先评估 agent-talk.html、必要时的 mia-chat.html，以及 zhi-agent-chat-history、zhi-agent-chat-feed 等已有聊天能力。自主聊天和广播功能须先完成权限、预算、循环触发与审计检查，不应未经审计直接启用。

## 标准接口原则
- 统一 Agent Manifest、World Manifest、消息信封和版本协商。
- 统一发现、认证、申请进入、授权、沟通和退出流程。
- 私有记忆默认隔离；世界间通信必须有明确授权。
- 通过适配层复用现有 Supabase 聊天系统，不推倒重建。
- docs/STANDARD_INTERFACE.md 是设计契约，不代表 API 已部署。

## 关心机制参考实现与当前限制

zhi_care.py 提供 CareState 状态机、证据认知状态、转换历史和应用层主体检查。zhi_care_repository.py 为它增加 SQLite 本地持久化、按 owner 查询、版本冲突检测。两者均为本地参考实现，尚未接入聊天 UI、Supabase、生产认证或数据库 RLS；SQLite 文件本身不加密，不能将应用层主体检查视为生产安全边界。

## 本地 Python MVP 的定位
本仓库的 main.py 是本地验证工具，用于检查管理型 Agent 的身份、任务审批、私有记忆、虚拟 ZHI 账本、审计和备份流程。当前任务计划是确定性的，执行结果是模拟记录，不会调用外部系统；它不是生产聊天后端。

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

数据库默认位于 ./data/zhi.db，可用环境变量 ZHI_DB 指定路径。数据库默认不加密；不要提交数据库文件或存入敏感信息。

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
5. 实现执行授权票据、可信回执和恢复流程，再进行跨云双端互操作验证。
6. 接入关心机制：Supabase 私有表与 zhi-care API 已建立；下一步完成有效令牌端到端测试、跨账号隔离测试、审批票据集成与聊天端接入。
7. 再加入经验反思、模拟账本、聊天内管理简报和跨世界协作。
