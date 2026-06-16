# CinaToken Cloudflare 全栈项目

## 架构

```
                    ┌─────────────────────────────┐
                    │     Cloudflare CDN / DNS     │
                    └─────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
    ┌───────────────┐     ┌───────────────┐     ┌───────────────────┐
    │  app.         │     │  classic.     │     │  api.             │
    │  cinatoken.com│     │  cinatoken.com│     │  cinatoken.com    │
    │  (Pages)      │     │  (Pages)      │     │  (Workers)         │
    └───────────────┘     └───────────────┘     └───────────────────┘
      现代前端               经典前端               后端 API
```

## 项目结构

```
cinatoken-cloudflare/
├── backend/                    # TypeScript Workers 后端
│   ├── src/
│   │   ├── index.ts            # 入口（路由注册）
│   │   ├── types/              # 类型定义
│   │   ├── utils/              # 工具函数 (JWT/加密/验证)
│   │   ├── repositories/       # 数据访问层 (D1)
│   │   ├── services/           # 业务逻辑 (Redis/User/Token/Channel/Distributor)
│   │   ├── middleware/         # 中间件 (Auth/RateLimit/CORS)
│   │   ├── relay/              # AI 代理实现 (OpenAI/Claude/Gemini)
│   │   └── routes/             # API 路由
│   ├── migrations/             # D1 数据库迁移
│   ├── wrangler.toml
│   └── package.json
├── frontend/
│   ├── default/                # 现代前端 (React 19 + Rsbuild)
│   ├── classic/                # 经典前端 (Semi UI + Rsbuild)
│   ├── package.json            # Workspace 配置
│   └── pnpm-workspace.yaml
├── .github/workflows/          # CI/CD
│   ├── deploy-backend.yml
│   ├── deploy-frontend-default.yml
│   └── deploy-frontend-classic.yml
└── README.md
```

## 技术栈

| 层级 | 技术 | 服务 |
|------|------|------|
| 后端 | TypeScript + Hono | Cloudflare Workers |
| 数据库 | SQLite | Cloudflare D1 |
| 缓存 | Redis | Upstash |
| 存储 | Object Storage | Cloudflare R2 |
| 前端 | React + Rsbuild | Cloudflare Pages |

## 快速开始

### 后端

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars    # 配置本地开发变量
npm run dev                        # 启动开发服务器
npm run deploy                     # 部署到生产环境
```

### 前端

```bash
cd frontend
pnpm install
cd default && pnpm run dev         # 启动现代前端
cd classic && pnpm run dev         # 启动经典前端
```

## 部署

### 自动部署（推荐）

推送代码到 `main` 分支即可自动部署。

### 手动部署

```bash
# 后端
cd backend && npm run deploy:prod

# 前端
cd frontend/default && pnpm run build && npx wrangler pages deploy dist --project-name=cinatoken-web
cd frontend/classic && pnpm run build && npx wrangler pages deploy dist --project-name=cinatoken-web-classic
```

## 成本

| 服务 | 月费 |
|------|------|
| Workers 付费版 | $5 |
| Upstash Redis | $5~$10 |
| D1 / KV / R2 / Pages | $0 |
| **合计** | **$10~$15/月** |

## 环境变量

后端需要配置以下 Secrets（通过 `wrangler secret put`）：

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥 |
| `ENCRYPTION_KEY` | AES 加密密钥 |
| `UPSTASH_REDIS_REST_URL` | Redis REST API URL |
| `UPSTASH_REDIS_REST_TOKEN` | Redis 访问令牌 |

## 许可证

AGPL-3.0
