# ZHI Care API（Supabase Edge Function）

状态：**已部署参考 API v1；尚未接入现有聊天 UI，尚未完成端到端验收。**

入口函数：`zhi-care`。它要求有效 Supabase JWT，并在服务端调用 Auth `getUser(token)` 确认实际用户。请求体中的 `user_id` 会被忽略；数据范围始终由已验证用户的 `user.id` 确定。

## 安全边界

- 数据存储：`public.zhi_care_states` 与 `public.zhi_care_events`。
- 两张表均启用 RLS，不为 `anon` / `authenticated` 建立直连策略；服务端函数使用 service-role 客户端，并在每次读写中显式按已验证的 `user_id` 过滤。
- 不要为了消除 Supabase Advisor 的 `rls_enabled_no_policy` 提示而开放客户端策略。这两张表与个人令牌、刷新凭据一样，设计为仅经服务端路径访问。
- 事件 metadata 只存最小化的状态/证据引用信息，不存聊天原文、健康信息或敏感内容。
- API 当前不允许状态直接转入 `in_progress`。在服务端审批票据和行动授权集成之前，客户端传入的 `approved: true` 等字段都不构成授权。
- 本函数的用户隔离基于 Supabase Auth 用户 ID。未来若一个登录账号可以控制多个智能人，需要增加服务端 Agent-ownership 映射，不能只信任请求里的 `agent_id`。

## 调用约定

请求方法：POST；请求头：`Authorization: Bearer <Supabase access token>` 与 `Content-Type: application/json`。

基础 URL：`https://lvxmygrgqtmzqgailmyl.supabase.co/functions/v1/zhi-care`

所有错误响应均为 `{ "error": "stable_error_code" }`，不会返回数据库错误正文。

### 创建关心状态

```json
{
  "action": "create",
  "care_id": "care:companion:001",
  "target_ref": "other:person:001",
  "care_focus": ["stated_need", "relationship_continuity"]
}
```

`care_id` 可省略，省略时服务端生成 UUID。记录强制为 private，初始状态为 discovered。成功返回 HTTP 201；重复的 `(user_id, care_id)` 返回 HTTP 409。

### 列出本人记录

```json
{ "action": "list", "limit": 50 }
```

只返回元数据列表，不包含证据内容；limit 范围为 1–100。

### 读取一条记录与事件

```json
{ "action": "get", "care_id": "care:companion:001" }
```

返回记录和最多 200 条最小化事件。找不到记录时返回 404，跨用户访问不会暴露其他用户记录是否存在。

### 添加证据引用

```json
{
  "action": "add_evidence",
  "care_id": "care:companion:001",
  "evidence_ref": "message:uuid-or-external-ref",
  "evidence_status": "reported",
  "source_ref": "conversation:uuid"
}
```

`evidence_status` 必须是 observed、reported、verified、inferred、hypothesis、unknown、conflicted 之一。API 只存证据引用，不接收证据原文；每次写入增加 revision。

### 状态转换

```json
{
  "action": "transition",
  "care_id": "care:companion:001",
  "to_state": "understanding",
  "reason_code": "message_received"
}
```

状态转换遵循状态机，使用 revision 条件更新防止旧版本覆盖。当前直接进入 `in_progress` 会返回 `supervised_action_gate_not_integrated`，直到真实审批票据与执行授权路径实现。

## 已验证与待验证

- 已验证：迁移已应用；两张表存在且启用 RLS；`anon` 与 `authenticated` 没有 SELECT 权限；`service_role` 有服务端访问权限；没有添加宽泛客户端策略。
- 已部署：Edge Function `zhi-care` v1，`verify_jwt=true`。
- 已新增 `scripts/smoke_test_zhi_care.py`，用于真实 API 冒烟测试：create/list/get/add_evidence/transition、重复 ID 冲突、监督执行门禁；设置第二个用户令牌后还会测试跨账号隔离。
- 待验证：实际运行上述脚本、并发冲突、审计失败恢复、聊天 UI 接入。未完成这些步骤前，不视为生产验收通过。

## 运行冒烟测试

需要本地 Python 3 与一个有效的 Supabase 登录 access token。脚本会创建一条合成测试记录；当前 API 尚无删除接口，因此记录会保留。

```bash
# Linux/macOS
export ZHI_ACCESS_TOKEN='你的登录 access token'
export ZHI_SECOND_ACCESS_TOKEN='另一个账号的 access token' # 可选，用于隔离测试
python scripts/smoke_test_zhi_care.py
```

PowerShell：

```powershell
$env:ZHI_ACCESS_TOKEN = '你的登录 access token'
$env:ZHI_SECOND_ACCESS_TOKEN = '另一个账号的 access token' # 可选
python scripts/smoke_test_zhi_care.py
```

脚本不会输出 access token。不要把令牌提交到 GitHub 或粘贴到聊天中。
