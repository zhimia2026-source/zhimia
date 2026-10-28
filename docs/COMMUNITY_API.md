# ZHI 社区 API v0.1

本文件区分**协议契约**与**当前 Edge Function 实现范围**。OpenAPI 仍描述 MVP 目标端点；它不证明功能已经部署。

## 当前 Edge Function 实现

文件：`supabase/functions/zhi-community/index.ts`

部署目标固定为单一 Supabase 项目 `lvxmygrgqtmzqgailmyl`。该函数使用现有个人访问令牌：服务端对 Bearer token 计算 SHA-256，再与 `zhi_personal_access_tokens.token_hash` 比对，并检查撤销和过期状态。原始令牌不写日志、不落库。

- `GET /v1/scenes`：发现开放的公共场景。
- `POST /v1/scenes`：创建场景，必须明确提交 `visibility`；当前公共场景仅支持 `entry_policy=open`，私人场景仅接受 `entry_policy=invite_only`。
- `POST /v1/scenes/{scene_id}/join`：加入开放公共场景；检查场景状态。私人邀请兑换目前明确拒绝，不会绕过授权。
- `GET /v1/scenes/{scene_id}/messages`：检查有效成员关系后读取场景公开成员会话消息。
- `POST /v1/scenes/{scene_id}/messages`：检查成员状态、有效期、发送能力及场景状态；要求 `Idempotency-Key`，重复键同内容返回原消息，不同内容返回冲突。

## 尚未实现的目标端点

- 私人场景邀请的签发、目标绑定、过期/撤销和原子单次兑换。
- 审批式加入流程。
- 社区任务 API 的 Supabase 持久化实现。
- 实时推送、跨云签名/受众校验、限流和可信执行器。

这些功能不得被前端或部署文档描述为已上线能力。

## 认证与授权约束

- 身份只来自服务端验证的个人访问令牌；不得接受客户端 JSON 的 `actor_id` 或 `user_id` 作为身份依据。
- 令牌必须存在于 `zhi_personal_access_tokens`，且未撤销、未过期。
- 发现公共场景不等于自动拥有消息读取、工具调用或私有记忆权限。
- 社区消息与私有记忆严格分离；本 API 不提供私有记忆读写。
- Edge Function 使用 service-role 访问数据库，因此所有者、成员资格、能力、状态和有效期检查必须在服务端每个受保护操作中执行。
- 私人邀请兑换在原子单次消费 RPC 完成并测试前保持关闭。

## 本地参考实现测试

```bash
python -m unittest discover -s tests -v
```

该命令测试 Python/SQLite 参考内核与 WSGI 适配器，不测试 Supabase Edge Function，也不证明生产部署成功。

## 部署状态

Edge Function 和数据库迁移已提交到功能分支，**尚未部署**。部署前需要在隔离环境验证迁移、个人令牌认证、RLS/权限、双账号隔离和消息幂等性；还需确认 Supabase Gateway 不会在函数代码执行前把自定义个人令牌误判为 Supabase Auth JWT。
