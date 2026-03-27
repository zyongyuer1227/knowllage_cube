# Knowllage Cube

文档索引见：[docs/README.md](./docs/README.md)。

## 项目结构

- `apps/backend`: NestJS 后端
- `apps/frontend`: Vue 3 + Vite 前端
- `db/migrations`: PostgreSQL 迁移脚本
- `static`: 前端静态资源

## 当前实现范围

当前代码已实现：

- 管理员登录，账号信息从 `apps/backend/.env` 读取
- 文档上传、批量上传、转换任务查询与重试
- 文档文件夹管理
- 文档详情读取、标题与 `archivePath` 更新
- Markdown 正文编辑
- 版本列表、版本 diff、版本回滚
- 游客检索、搜索建议、文档预览、文件夹列表
- 审计日志查询
- 系统健康检查

当前仓库未提供完整实现的能力：

- 回收站、恢复、永久删除、作废流程
- 统计接口
- 报表导出
- 邮件提醒

如需这些能力，请以源码实现为准，不要直接依赖历史规划文档中的接口描述。

## 本地开发

1. 安装依赖
```bash
npm install
```

2. 启动后端
```bash
npm run dev:backend
```

3. 启动前端
```bash
npm run dev:frontend
```

前端开发态默认通过 Vite 代理 `/api` 到本机后端；生产部署建议由反向代理统一转发到后端 `3000` 端口。

## 健康检查与登录

健康检查：

```bash
GET /api/v1/system/health
```

管理员登录：

```json
POST /api/v1/admin/auth/login
{
  "username": "admin",
  "password": "Admin@123",
  "captcha": "1234"
}
```

当前管理员账号不走用户表，直接读取 `apps/backend/.env` 中的：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_LOGIN_CAPTCHA`

## 数据库初始化

推荐使用后端脚本执行迁移：

```bash
cd apps/backend
npm run db:migrate
```

最小联调检查：

```bash
npm run build
npm run smoke:backend
```

## 后端最小环境变量

- `PORT=3000`
- `HOST=0.0.0.0`
- `DB_HOST=192.168.0.39`
- `DB_PORT=5433`
- `DB_USER=flzskuser`
- `DB_PASSWORD=***`
- `DB_NAME=flzskdb`
- `JWT_SECRET=replace-this-secret`
- `JWT_EXPIRES_IN=8h`
- `ADMIN_USERNAME=admin`
- `ADMIN_PASSWORD=Admin@123`
- `ADMIN_LOGIN_CAPTCHA=1234`
- `CORS_ORIGIN=http://192.168.0.39:5173,http://127.0.0.1:5173,http://localhost:5173`

环境变量模板：

- 后端：复制 [apps/backend/.env.example](./apps/backend/.env.example)
- 前端：复制 [apps/frontend/.env.example](./apps/frontend/.env.example)

## 已实现接口

管理员文档：

- `GET /api/v1/admin/documents/folders`
- `POST /api/v1/admin/documents/folders`
- `POST /api/v1/admin/documents/upload`
- `POST /api/v1/admin/documents/upload/batch`
- `GET /api/v1/admin/documents/tasks/:taskId`
- `POST /api/v1/admin/documents/tasks/:taskId/retry`
- `GET /api/v1/admin/documents/:id`
- `PUT /api/v1/admin/documents/:id`
- `DELETE /api/v1/admin/documents/:id`
- `PUT /api/v1/admin/documents/:id/content`
- `GET /api/v1/admin/documents/:id/versions`
- `GET /api/v1/admin/documents/:id/versions/:versionNo/diff?targetVersionNo=2`
- `POST /api/v1/admin/documents/:id/versions/:versionNo/rollback`

游客检索：

- `GET /api/v1/public/search`
  - 支持参数：`q`、`page`、`pageSize`、`sortBy`（`relevance|createdAt|updatedAt`）、`order`
- `GET /api/v1/public/search/suggest?q=关键词`
- `GET /api/v1/public/search/folders`
- `GET /api/v1/public/documents/:id`

审计：

- `GET /api/v1/admin/audits`
  - 支持参数：`page`、`pageSize`、`operation`、`targetType`、`operatorId`

系统：

- `GET /api/v1/system/health`

## 文档转换依赖

Ubuntu 24.04 建议安装：

```bash
sudo apt-get update
sudo apt-get install -y pandoc libreoffice poppler-utils
```
