# 开发续接记录（2026-03-28）

## 1. 本文件目的

本文件记录 `2026-03-28` 当天对项目做的收尾清理、当前真实功能范围、已验证结果和明天续接时需要注意的事项。  
明天继续开发时，优先读取本文件和根目录 `README.md`，不要再按旧规划文档判断项目状态。

## 2. 今天完成的事情

### 2.1 项目状态重新核对

今天重新 review 了当前代码，确认项目当前实际可用功能为：

- 管理员登录
- 文档单传/批量上传
- 文档转换任务与重试
- 文件夹管理
- 文档详情、标题和 `archivePath` 编辑
- Markdown 正文编辑
- 版本列表、diff、回滚
- 游客检索、联想建议、文档预览、文件夹列表
- 审计日志查询
- 系统健康检查

明确确认未实现且已决定废弃的能力：

- 回收站
- 恢复
- 永久删除
- 作废流程
- 统计接口
- 报表导出
- 邮件提醒

### 2.2 已完成的清理

今天已经完成：

- 删除后端空占位模块目录：
  - `apps/backend/src/modules/reminder`
  - `apps/backend/src/modules/reports`
  - `apps/backend/src/modules/statistics`
- 更新根目录 `README.md`，让接口和功能描述与当前代码一致
- 更新 `docs/README.md`，避免再指向不存在或过期的规划文档
- 清理数据库迁移，移除与废弃功能相关的旧迁移文件

## 3. 当前保留的后端模块

- `apps/backend/src/modules/auth`
- `apps/backend/src/modules/document`
- `apps/backend/src/modules/search`
- `apps/backend/src/modules/audit`
- `apps/backend/src/modules/system`

`AppModule` 当前只接入以上五个模块，和现有功能范围一致。

## 4. 当前保留的数据库迁移

目前 `db/migrations` 中保留：

- `0001_init.sql`
- `0002_conversion_tasks.sql`
- `0004_document_versions_metadata.sql`
- `0008_document_folders.sql`

说明：

- `0001_init.sql` 已被整理为当前项目的最小基线
- 与回收站、作废、统计、提醒相关的迁移已删除
- 现在的迁移链更适合“按当前代码重新初始化数据库”

## 5. 今天的验证结果

今天执行并确认通过：

```bash
npm run build
```

结果：

- 后端构建通过
- 前端构建通过
- 当前删除空模块目录和迁移清理后，项目仍可正常构建

仍存在但不影响构建的现象：

- Vite 构建时会提示 `static/fonts` 下字体资源在构建时未解析，这目前只是警告，不影响产物生成

## 6. 明天续接时的注意事项

- 继续开发前，先看：
  - `dev_new.md`
  - `README.md`
  - `apps/backend/src/app.module.ts`
- 判断功能是否存在时，以源码和 `README.md` 为准
- 不要再按旧的 `dev.md` 判断项目现状，`dev.md` 中包含已经废弃的功能记录
- 如果需要继续做“冗余清理”，优先检查：
  - 历史测试数据
  - 未使用的前端派生文件
  - 旧截图和临时文档

## 7. PostgreSQL 在本项目中的角色定位

PostgreSQL 在本项目里不是可选配套，而是核心业务存储层。  
它当前承担的职责是：

- 存储文档主数据：`documents`
- 存储文档正文：`document_contents`
- 存储版本历史：`document_versions`
- 存储转换任务状态：`document_conversion_tasks`
- 存储文件夹树：`document_folders`
- 存储审计日志：`operation_logs`

换句话说，当前项目的“文档管理、版本管理、检索展示、审计查询”都依赖 PostgreSQL。

明天需要重点考虑的不是“要不要用 PostgreSQL”，而是下面这些问题：

- 现有最小迁移基线是否足够稳定，能否支持从零建库
- 当前表结构是否已经贴合最终保留功能，没有继续残留历史字段
- 检索能力是否只维持当前简单方案，还是后续要继续增强 SQL 查询能力
- 文档正文、版本正文和审计日志的增长后，索引和查询性能是否需要提前处理
- 部署到目标环境时，迁移执行顺序和数据库初始化流程是否已经足够清晰

结论：

- PostgreSQL 在本项目中的因公角色定位是“唯一正式业务数据库”
- 明天如果继续收尾，数据库结构与迁移链应作为重点检查项

## 8. 明天建议的首个动作

如果明天继续收尾，建议第一步执行：

```bash
npm run build
```

先确认本地状态稳定，再决定是否继续做二次清理或进入部署准备。
