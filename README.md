# Deno Deploy 代理部署指南

## 项目信息

- **GitHub 仓库**: https://github.com/Cypewake/wakeproxy
- **Deno Deploy 项目**: https://console.deno.com/cypewake/wakeproxy
- **当前部署地址**: https://wakeproxy-cgy2btptfvta.cypewake.deno.net

## 前置条件

1. 安装 Deno：`irm https://deno.land/install.ps1 | iex`（Windows）
2. 安装 deployctl：`deno install -gArf jsr:@deno/deployctl`
3. 准备 Supabase Service Role Key（从 Supabase 控制台获取）

## 部署方式

### 方式一：GitHub Actions 自动部署（推荐）

**已配置工作流**: `.github/workflows/deploy.yml`

**配置步骤**:

1. **推送代码到 GitHub**
   ```bash
   cd dist/server-deno
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **在 Deno Deploy 控制台配置**:
   - 打开: https://console.deno.com/cypewake/wakeproxy
   - 连接 GitHub 仓库
   - 设置环境变量（**不在代码中存储敏感信息**）:
     ```
     SUPABASE_URL=https://pzlmnasbtjcclazdwtir.supabase.co
     SUPABASE_SERVICE_KEY=your-service-role-key
     API_SECRET=xuetong-2026-proxy-secret-key
     ```

3. **触发部署**:
   - 每次推送到 `main` 或 `master` 分支自动部署

### 方式二：本地手动部署

```bash
cd dist/server-deno

# 1. 配置环境变量
copy .env.example .env
# 编辑 .env 文件，填入实际配置

# 2. 本地测试（可选）
deno run --allow-env --allow-net main.ts
# 访问 http://localhost:8000

# 3. 部署到 Deno Deploy
deployctl deploy --project=wakeproxy --env-file=.env
```

### 方式三：一键部署（Windows）

双击运行 `一键部署.bat`

## API 端点

| 端点 | 功能 |
|------|------|
| POST /api/activate | 激活卡密 |
| POST /api/consume | 消耗答题次数 |
| POST /api/verify-answer | 验证答题权限 |
| POST /api/get-remaining | 获取剩余次数 |
| POST /api/redeem-invite | 兑换邀请码 |
| POST /api/register-invite | 注册邀请码 |
| POST /api/get-invite-code | 获取设备邀请码 |
| GET /health | 健康检查 |

## 请求格式

```json
{
  "Authorization": "Bearer YOUR_API_SECRET"
}

Body: {
  "card_hash": "...",
  "device_fingerprint": "...",
  // 其他参数根据端点不同
}
```

## 安全特性

- API 密钥验证（Bearer Token）
- 限流保护（100 次/分钟）
- CORS 支持
- 错误日志记录
- 参数类型校验

## 环境变量清单

| 变量名 | 说明 | 示例 |
|--------|------|------|
| SUPABASE_URL | Supabase 项目 URL | https://xxx.supabase.co |
| SUPABASE_SERVICE_KEY | Supabase Service Role Key | xxx |
| API_SECRET | API 访问密钥 | xxx |

## 注意事项

1. **敏感信息保护**: 不要将 `.env` 文件提交到版本控制
2. **环境变量**: 通过 Deno Deploy 控制台配置，而非代码中硬编码
3. **部署日志**: 在 Deno Deploy 控制台查看部署状态和日志