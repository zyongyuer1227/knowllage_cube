# 开发续接记录

## 1. 本文件目的

本文件记录 `2026-03-27` 当天已完成的开发内容、当前项目状态、联调方式、已知缺口和服务器续接要点。  
后续将代码上传到 `192.168.0.39` 后，可直接据此继续开发，不需要重新梳理上下文。

## 2. 当前环境基线

- 服务器：`192.168.0.39`
- 操作系统：`Ubuntu 24.04`
- Node.js：`v25.8.0`
- PostgreSQL：`16.13`
- 数据库连接：
  - `DB_HOST=192.168.0.39`
  - `DB_PORT=5433`
  - `DB_USER=flzskuser`
  - `DB_NAME=flzskdb`

## 3. 当前技术栈

- 前端：`Vue 3 + TypeScript + Vite + Pinia + Vue Router`
- 后端：`NestJS + TypeORM + JWT`
- 数据库：`PostgreSQL`
- 报表：`xlsx`
- 邮件：`nodemailer`
- 文件转换：
  - `txt/html` 内置处理
  - `doc/docx`：`pandoc` 或 `libreoffice`
  - `pdf`：`pdftotext` 或 `pandoc`

## 4. 今天已完成的关键开发

### 4.1 核心业务能力

已完成并打通：

- 管理员登录
- 文档单传/批量上传
- 文档转换任务与重试
- 文档详情、编辑、作废、回收站、恢复、永久删除
- 版本列表、差异、回滚
- 游客检索、联想、文档预览
- 审计日志
- 统计分析
- Excel 报表导出
- 备份、恢复、回收站清理、定时任务
- 到期提醒
- 邮件提醒通道
- 病毒扫描接入

### 4.2 前端管理端

已具备页面操作能力：

- 管理员登录
- 上传文档
- 搜索文档并加载详情
- 编辑元数据
- 编辑 Markdown 正文
- 作废
- 回收站查看与恢复
- 版本历史查看
- 版本 diff 查看
- 版本回滚
- 提醒规则编辑
- 通知筛选
- 统计查看
- 导出报表

### 4.3 用户系统简化

已经移除原数据库用户体系：

- 不再依赖 `users` 表
- 管理员账号密码直接读取 `apps/backend/.env`
- 已删除用户实体和相关冗余逻辑
- 已新增历史归档文档：
  - `docs/original-user-system-archive.md`

管理员当前配置项：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_LOGIN_CAPTCHA`

## 5. 今天完成的联调收口

为便于部署到 `192.168.0.39` 后继续联调，已额外完成：

- 后端启用 CORS，支持通过 `CORS_ORIGIN` 配置
- 后端默认可监听 `0.0.0.0`
- 前端默认 API 地址改为相对路径 `/api/v1`
- Vite 开发态代理 `/api` 到本地后端
- `.env.example` 已更新为当前服务器/数据库基线
- 新增前端 `.env.example`
- 作废文档不再允许公开预览
- 新增最小 smoke 脚本

## 6. 已验证结果

今天已验证通过：

- 后端构建：通过
- 前端构建：通过
- 数据库清理迁移：通过
- 后端 smoke：通过

真实 smoke 结果：

- `SMOKE_HEALTH=ok`
- `SMOKE_DB=up`
- `SMOKE_LOGIN_USER=admin`
- `SMOKE_TOKEN=true`
- `SMOKE_SEARCH_TOTAL=16`

## 7. 当前目录中重要文件

### 核心说明

- `README.md`
- `dev.md`
- `docs/README.md`
- `docs/development-requirements.md`
- `docs/functional-development-plan.md`
- `docs/original-user-system-archive.md`

### 后端关键目录

- `apps/backend/src/modules/auth`
- `apps/backend/src/modules/document`
- `apps/backend/src/modules/search`
- `apps/backend/src/modules/audit`
- `apps/backend/src/modules/statistics`
- `apps/backend/src/modules/reports`
- `apps/backend/src/modules/reminder`
- `apps/backend/src/modules/system`
- `apps/backend/scripts`

### 数据库迁移

- `db/migrations/0001_init.sql`
- `db/migrations/0002_conversion_tasks.sql`
- `db/migrations/0003_document_void_fields.sql`
- `db/migrations/0004_document_versions_metadata.sql`
- `db/migrations/0005_search_logs.sql`
- `db/migrations/0006_notifications.sql`
- `db/migrations/0007_drop_users.sql`

## 8. 上传服务器后建议立即执行

### 8.1 安装依赖

```bash
npm install
```

### 8.2 配置环境变量

后端：

```bash
cp apps/backend/.env.example apps/backend/.env
```

前端：

```bash
cp apps/frontend/.env.example apps/frontend/.env
```

然后确认后端 `.env` 中以下项正确：

- `HOST=0.0.0.0`
- `PORT=3000`
- `DB_HOST=192.168.0.39`
- `DB_PORT=5433`
- `DB_USER=flzskuser`
- `DB_PASSWORD=实际密码`
- `DB_NAME=flzskdb`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_LOGIN_CAPTCHA`
- `CORS_ORIGIN`

### 8.3 执行迁移

```bash
cd apps/backend
npm run db:migrate
npm run db:migrate -- 0002_conversion_tasks.sql
npm run db:migrate -- 0003_document_void_fields.sql
npm run db:migrate -- 0004_document_versions_metadata.sql
npm run db:migrate -- 0005_search_logs.sql
npm run db:migrate -- 0006_notifications.sql
npm run db:migrate -- 0007_drop_users.sql
```

### 8.4 构建和冒烟

```bash
cd /path/to/project
npm run build
npm run smoke:backend
```

### 8.5 开发联调

```bash
npm run dev:backend
npm run dev:frontend
```

## 9. 当前默认联调方式

- 后端：`http://127.0.0.1:3000`
- 前端：`http://127.0.0.1:5173`
- 前端请求：通过 Vite 代理到 `/api/v1`

生产部署建议：

- `Nginx` 提供前端静态文件
- `Nginx` 将 `/api/` 反代到 `127.0.0.1:3000`

## 10. 当前已知未收口项

以下不是阻断上线的核心缺口，但后续还可以继续完善：

- `Nginx` 正式配置文件未落地
- `systemd` 或 `PM2` 启动文件未落地
- SMTP 真实账号未配置
- `pandoc/libreoffice/pdftotext/clamav` 是否已在服务器安装，需要实机确认
- 自动化测试仍较少，当前主要依赖 smoke + 人工联调

## 11. 后续继续开发时优先顺序建议

如果上传服务器后继续开发，建议按这个顺序接着做：

1. 补 `Nginx` 配置
2. 补 `systemd` 服务文件
3. 做一轮真实服务器联调
4. 补最小 e2e/接口测试
5. 再做体验优化和运维增强

## 12. 补充说明

- 用户管理模块已被彻底移除，不要再按 `users` 表思路继续开发。
- 如果未来需要恢复用户体系，参考：
  - `docs/original-user-system-archive.md`
- 当前项目已具备继续部署、联调、扩展开发的基础，不需要回退之前的实现。
