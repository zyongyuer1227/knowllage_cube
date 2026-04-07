# 原用户系统实现归档

## 1. 归档目的

本文档记录项目早期“用户表 + 数据库认证”方案的实现技术栈和逻辑，用于后续需要恢复用户系统时参考。  
当前线上代码已切换为“管理员账号直接读取 `.env`”，本归档仅作历史记录，不代表现行实现。

## 2. 当时的技术栈

- 后端框架：`NestJS`
- 数据访问：`TypeORM`
- 认证方式：`JWT`
- 密码校验：`bcryptjs`
- 用户存储：`PostgreSQL users` 表
- 验证码：登录接口中使用固定验证码配置项校验

## 3. 原实现结构

涉及模块主要在 `apps/backend/src/modules/auth/`：

- `auth.controller.ts`
- `auth.module.ts`
- `auth.service.ts`
- `dto/login.dto.ts`
- `entities/user.entity.ts`（已删除）

数据库初始化原本由 `db/migrations/0001_init.sql` 创建 `users` 表并插入默认管理员。

## 4. 原数据结构

原 `users` 表字段如下：

- `id`
- `username`
- `password_hash`
- `role`
- `is_active`
- `created_at`
- `updated_at`

同时，以下业务表原本通过外键引用 `users(id)`：

- `documents.created_by`
- `documents.updated_by`
- `document_versions.changed_by`
- `operation_logs.operator_id`
- `recycle_bin.deleted_by`

这意味着“用户表”不只是登录用途，还承担了操作人关联作用。

## 5. 原登录逻辑

原登录链路是：

1. 前端调用 `POST /api/v1/admin/auth/login`
2. 后端先校验验证码
3. 根据 `username` 查询 `users` 表
4. 校验 `is_active`
5. 使用 `bcryptjs.compare()` 对比明文密码和 `password_hash`
6. 校验通过后签发 JWT
7. JWT 中写入 `sub`、`username`、`role`

返回体逻辑与现在相近，都会返回：

- `token`
- `user.id`
- `user.username`
- `user.role`

## 6. 原管理员初始化方式

原方案会在数据库迁移阶段插入默认管理员账号：

- 用户名：`admin`
- 角色：`admin`
- 密码：以 `bcrypt` 哈希形式写入数据库

这套方案的特点是：

- 登录依赖数据库可用
- 支持未来扩展多个管理员
- 支持账号启停、密码变更、用户表扩展字段

## 7. 原认证模块依赖关系

原 `AuthModule` 的关键依赖包括：

- `ConfigModule`
- `JwtModule`
- `TypeOrmModule.forFeature([UserEntity])`

原 `AuthService` 会注入：

- `Repository<UserEntity>`
- `JwtService`
- `ConfigService`

现行实现已经移除了 `UserEntity` 和仓储依赖，仅保留 `JwtService + ConfigService`。

## 8. 原方案的优缺点

优点：

- 结构标准，符合常规后台账号体系设计
- 后续扩展多管理员、停用账号、修改密码都比较直接
- 审计日志中的操作人可以通过外键保持强约束

缺点：

- 对当前项目规模偏重
- 增加了 `users` 表、实体、依赖包、迁移和备份复杂度
- 登录链路依赖数据库，不适合当前“单管理员、低并发、轻量维护”目标

## 9. 本次移除内容

本轮简化时已移除或替换：

- 删除 `UserEntity` 源文件
- `AuthModule` 不再引入 `TypeOrmModule.forFeature([UserEntity])`
- `AuthService` 不再查询数据库，也不再使用 `bcryptjs`
- `users` 表从初始化迁移中删除
- 新增数据库清理迁移，移除旧库中的 `users` 表与相关外键
- 备份/恢复逻辑不再包含 `users`

## 10. 现行替代方案

当前管理员认证方式为：

- 用户名：读取 `ADMIN_USERNAME`
- 密码：读取 `ADMIN_PASSWORD`
- 验证码：读取 `ADMIN_LOGIN_CAPTCHA`
- 登录成功后仍签发 JWT

适用场景：

- 管理员数量固定
- 不需要后台用户管理
- 更关注轻量上线和低维护成本

## 11. 后续如果要恢复用户系统

建议按下面顺序恢复，而不是直接回滚当前代码：

1. 重新设计 `users` 表与最小字段
2. 恢复 `UserEntity`
3. 在 `AuthModule` 中重新接入 `TypeORM Repository`
4. 恢复 `bcrypt` 密码哈希校验
5. 再决定是否恢复各业务表对 `users.id` 的外键约束

恢复时建议优先考虑“弱关联”而不是重新把所有操作字段都强绑外键，避免后续再次简化时牵扯过大。
