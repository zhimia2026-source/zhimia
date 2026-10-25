# 健康顾问独立登录：端到端验收记录

## 范围与判定规则
本清单用于健康顾问独立 ZHIMIA Auth 前端（web/zhi-health-advisor.html）及 Edge Function。只有在真实浏览器、两个独立测试账号和线上函数环境完成并留存结果后，才能标记 E2E 通过。代码存在或部署成功不能替代端到端验收。

## 部署前必须配置
1. Supabase Dashboard → Project lvxmygrgqtmzqgailmyl → Authentication → URL Configuration：将实际部署地址加入 Site URL / Redirect URLs。
2. Authentication → Providers：确认 Email provider 已启用，并确定是否要求邮箱验证。
3. Edge Function Secrets：设置 OPENAI_API_KEY；可选设置 ZHI_MODEL_NAME；设置 ZHI_ALLOWED_ORIGINS 为部署站点的精确 origin（scheme + host + optional port），不要加路径、通配符或尾部斜杠。
4. 将 web/zhi-health-advisor.html 与 web/zhi-health-advisor-client.js 一起部署到静态站点；二者必须同源。不要用 file:// 打开。
5. 浏览器端只使用 publishable key。严禁将 service-role key 或模型密钥放入 HTML、GitHub、浏览器存储或用户可见配置。

## 测试矩阵
| ID | 测试 | 通过条件 | 当前状态 |
|---|---|---|---|
| AUTH-01 | 未登录直接调用函数 | 返回 401，且无数据写入 | 待在线请求验证 |
| AUTH-02 | 注册新账号 | 按项目配置完成注册/邮箱验证；账号身份为独立 Auth user | 待真实邮箱验证 |
| AUTH-03 | 错误密码登录 | 登录失败，不建立会话 | 待浏览器验证 |
| AUTH-04 | 登录、刷新页面、退出 | sessionStorage 会话行为符合预期；退出后不能发送 | 待浏览器验证 |
| CHAT-01 | 未同意存储时提问 | 单轮问答不读取/写入历史，响应 persisted=false | 待模型密钥及在线请求 |
| CHAT-02 | 同意存储后提问 | 私有会话、用户消息、助手消息按当前 Auth UID 保存 | 待模型密钥及在线请求 |
| CHAT-03 | 历史列表/会话载入 | 只显示当前用户数据；历史读取需有效授权 | 待双账号验证 |
| PRIV-01 | A 尝试读取 B 会话/消息 | PostgREST 与 Edge Function 均无法读取 | 待双账号攻击测试 |
| PRIV-02 | A 尝试删除 B 会话 | 无法删除；B 的记录仍存在 | 待双账号攻击测试 |
| PRIV-03 | A 尝试插入 assistant 消息 | RLS 拒绝客户端写入 assistant role | 待 RLS 在线验证 |
| PRIV-04 | 撤销存储授权 | 后续请求不读取/保存历史；前端告知旧记录不会自动删除 | 待浏览器验证 |
| SAFE-01 | 严重胸痛/呼吸困难等安全触发词 | 返回安全覆盖，不调用模型也能响应 | 待真实请求验证 |
| SAFE-02 | 非触发词 | 不声称排除急症，普通回答标记 L0 | 待模型密钥及在线请求 |
| SAFE-03 | 模型密钥缺失/模型错误 | 普通问答明确失败，不伪造回答 | 已有代码分支；仍待线上注入故障验证 |
| NET-01 | 未列入 allowlist 的 Origin | 浏览器请求被拒绝 | 待线上 CORS 验证 |
| NET-02 | 同一 request_id 重放 | 已授权存储时不重复写入消息 | 待线上重放验证 |
| AUD-01 | 检查函数日志与审计表 | 无原始健康文本、密码、token 或模型密钥 | 待日志复查 |

## 安全不变量
- Auth UID 来自 Supabase Auth 的已验证会话；不能从请求体接收 user_id 作为授权依据。
- 所有健康数据表启用 RLS，数据行限定 auth.uid() = user_id。
- Edge Function verify_jwt=true，且服务端调用 Auth getUser() 验证实际用户。
- 浏览器端无 service-role key；模型密钥仅保存在 Edge Function Secrets。
- 历史保存为 opt-in；不授权时只使用本轮消息。长期记忆写入目前关闭。
- 撤销保存授权不会自动删除既有数据；需要删除时重新授权并删除会话，或按数据主体请求执行经验证的删除流程。
- 关键词安全筛查不是临床分诊，不触发关键词不等于无急症。

## 当前验收结论
尚未完成 E2E 验收。前端与验收清单加入仓库后，仍需完成 Secrets/Origin 配置、真实邮箱账号、双账号隔离攻击测试以及线上请求验证。不得将未执行的矩阵项目标记为通过。