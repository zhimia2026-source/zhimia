# 旧跨项目个人身份断言桥接契约（已被取代）

状态：**已被单一 Supabase 项目架构取代；不作为实施方案。**

用户已明确决定：ZHI 的全部数据库统一使用 https://lvxmygrgqtmzqgailmyl.supabase.co。

因此，不再建设“个人令牌网关 → 另一个 Supabase Core”的跨项目身份断言桥接。目标实现应统一数据库、Auth 与 Edge Functions 的项目归属，使用同一项目中经验证的用户会话，并在每个 API 内继续执行独立的资源级授权。

旧聊天 Core 原先指向另一个项目，不能只替换客户端 URL。必须先盘点并迁移表结构、数据、RLS/policies、RPC、Edge Functions、Storage/Realtime 配置和身份/外键映射；完成备份、合成数据测试、跨账号隔离、桌面/移动端回归与回滚演练后，才可切换生产流量。

详细执行步骤见 [单一 Supabase 项目部署与数据归并方案](SUPABASE_SINGLE_PROJECT_PLAN.md)。

保留本文件仅用于解释旧方案为何不再实施。不得把旧版跨项目断言设计描述为已部署功能。
