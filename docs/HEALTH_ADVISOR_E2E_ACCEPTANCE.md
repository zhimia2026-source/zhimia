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
| AUTH-01 | 未登录直接调用函数 | 返回 401，且无数据写入 | 自动化脚本覆盖；待带真实配置运行 |
| AUTH-02 | 注册新账号 | 按项目配置完成注册/邮箱验证；账号身份为独立 Auth user | 待真实邮箱验证 |
| AUTH-03 | 错误密码登录 | 登录失败，不建立会话 | 待浏览器验证 |
| AUTH-04 | 登录、刷新页面、退出 | sessionStorage 会话行为符合预期；退出后不能发送 | 待浏览器验证 |
| CHAT-01 | 未同意存储时提问 | 单轮安全问答不读取/写入历史，响应 persisted=false | 自动化脚本覆盖；待在线运行 |
| CHAT-02 | 同意存储后提问 | 私有会话、用户消息、助手消息按当前 Auth UID 保存 | 安全响应路径由脚本覆盖；普通模型问答待在线运行 |
| CHAT-03 | 历史列表/会话载入 | 只显示当前用户数据；历史读取需有效授权 | 待双账号验证 |
| PRIV-01 | A 尝试读取 B 会话/消息 | PostgREST 与 Edge Function 均无法读取 | 自动化脚本覆盖会话/消息读取；待真实运行 |
| PRIV-02 | A 尝试删除 B 会话 | 无法删除；B 的记录仍存在 | 自动化脚本覆盖；待真实运行 |
| PRIV-03 | A 尝试插入 assistant 消息 | 普通客户端无法直接插入 assistant 消息 | 自动化脚本覆盖；数据库权限已复核 |
| PRIV-04 | 撤销存储授权 | 后续请求不读取/保存历史；前端告知旧记录不会自动删除 | 自动化脚本覆盖服务端不保存；待真实运行与浏览器检查 |
| SAFE-01 | 严重胸痛/呼吸困难等安全触发词 | 返回安全覆盖，不调用模型也能响应 | 待真实请求验证 |
| SAFE-02 | 非触发词 | 不声称排除急症，普通回答标记 L0 | 待模型密钥及在线请求 |
| SAFE-03 | 模型密钥缺失/模型错误 | 普通问答明确失败，不伪造回答 | 已有代码分支；仍待线上注入故障验证 |
| NET-01 | 未列入 allowlist 的 Origin | 浏览器请求被拒绝 | 自动化脚本覆盖；待真实配置运行 |
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

- 2026-10-25：GitHub Actions `Health Advisor Static Checks` 与 `Python and Edge Function tests` 已成功完成；前者验证 E2E 脚本语法与浏览器密钥扫描，不等于真实线上 E2E 通过。
- GitHub Pages 构建和 artifact 上传成功，但部署阶段因仓库 Pages 尚未启用而返回 HTTP 404。需在仓库 Settings → Pages 中选择 GitHub Actions 作为部署来源，然后确认部署 workflow 成功。
- 真实 E2E 尚未完成：仍需配置 `OPENAI_API_KEY` 与 `ZHI_ALLOWED_ORIGINS`，设置 Supabase Auth Redirect URL，创建两个专用测试账号并运行脚本。
- 不得将未执行的矩阵项目标记为通过。
## 个人令牌续签专项（2026-10-27）

| ID | 测试 | 通过条件 | 当前状态 |
|---|---|---|---|
| TOKEN-01 | 管理员签发凭证组 | 创建独立 Auth UID；仅保存 access/refresh 哈希；返回 access 与 refresh 原文一次 | 代码已部署，待真实管理员登录签发验证 |
| TOKEN-02 | 自动续签 | access 令牌 15 分钟过期后，客户端用 refresh 凭证换取新 access + refresh，并重试原请求一次 | 客户端代码已提交，待浏览器验证 |
| TOKEN-03 | 连续续签 | 每次续签生成新的 refresh，90 天滚动有效期从续签时重新计算 | 代码路径已部署，待线上验证 |
| TOKEN-04 | 旧 refresh 重放 | 重用已轮换的 refresh 后，同一 family 的 access 与 refresh 均被撤销 | 已加入服务端防重放处理，待并发/重放测试 |
| TOKEN-05 | 管理员撤销 | 撤销 token_id 对应 family 的 access 与 refresh 凭证 | 代码已部署，待线上验证 |
| TOKEN-06 | 部分失败恢复 | 任一签发步骤失败时清理已创建记录，续签部分失败时撤销该 family，避免留下可用孤儿凭证 | 有补偿清理逻辑；非单事务，仍需故障注入验证 |
| TOKEN-07 | 跨用户隔离 | 两个不同凭证组不能访问对方会话/消息；撤销 A 不影响 B | 待双用户线上验证 |

### 当前凭证策略
- access token：15 分钟有效；refresh token：每次续签后滚动 90 天有效。用户需在 refresh 到期前至少成功续签一次，不能把它描述为无期限永不失效。
- 浏览器客户端把 access 与 refresh 凭证放在 sessionStorage；退出登录会同时清除两项。避免把 refresh 凭证放进 URL、日志或分析事件。
- 服务端仅保存 SHA-256 哈希。刷新凭证只在签发/轮换响应中返回原文。
- 轮换由 Edge Function 的条件更新与补偿撤销保护；当前不是单个数据库事务，仍需进一步做故障注入和并发测试。
- 以上代码部署/提交不等于端到端验收通过；未实际执行的项目仍标记为待验证。
