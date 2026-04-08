# Dev Log

## Date

- 2026-04-08

## Today

- 管理员界面文档管理列表做了多轮布局收敛：
  - 去掉列表中的属性按钮，统一使用右下角“文档属性”入口。
  - 压缩标题、业务、效力、删除按钮的排布，删除按钮改成纯图标并右靠。
  - 当前文档列表更偏后台列表行，而不是大卡片堆叠。
- 管理员工作区改成懒加载详情：
  - `loadAdminWorkspace` 现在只加载摘要列表，不再逐篇 `getDocument`。
  - 点击某篇文档后，才请求该文档详情。
  - 右侧编辑/预览区增加“正在加载文档详情...”状态。
- 游客工作区也改成懒加载详情：
  - `loadPublicWorkspace` 现在只加载摘要列表。
  - 点击结果列表文档后，才请求 `publicDocument` 详情。
  - 游客页预览对象已修正为“列表摘要 + 当前详情合并”，否则会出现标题有、正文空的问题。
- 预览组件已拆分，避免游客/管理员互相影响：
  - `AdminDocPreview.vue`：管理员专用，支持 iframe 内部滚动和与 Markdown 编辑器联动。
  - `GuestDocPreview.vue`：游客专用，只负责稳定渲染和自动撑高。
  - 原 `GovDocPreview.vue` 目前仍保留在仓库中，但页面已切换到新组件。
- 管理员预览滚动条已调整：
  - 只保留 iframe 内部文档滚动条。
  - 去掉预览外层容器滚动条。
  - Markdown 编辑器与管理员预览滚动联动仍保留。

## Files Touched

- `apps/frontend/src/views/AdminPage.vue`
- `apps/frontend/src/views/GuestPage.vue`
- `apps/frontend/src/stores/workspace.ts`
- `apps/frontend/src/components/AdminDocPreview.vue`
- `apps/frontend/src/components/GuestDocPreview.vue`
- `apps/frontend/src/components/GovDocPreview.vue`

## Current Expected Behavior

- 管理员界面打开时，左侧文档列表应先出现，右侧先显示欢迎内容或当前已选内容。
- 管理员点击某篇文档后，右侧再加载正文详情与 HTML 预览。
- 游客界面打开时，不再依赖全量详情请求；点击文档后再拉取正文详情。
- 游客界面文档正文应能正常显示在右侧预览区。

## Validation Done

- 已多次执行 `npm --workspace apps/frontend run build`，当前通过。

## Known Risks / Things To Verify Tomorrow

- 需要人工验证游客界面正文是否对所有已有文档都稳定显示，尤其是带 `persistedHtml` 的老文档。
- 需要人工验证游客页首次进入、切换筛选、点击不同文档时，详情加载状态是否稳定。
- 需要人工验证管理员界面滚动联动是否只在管理员页生效，游客页不再受影响。
- `GovDocPreview.vue` 已基本退出页面使用，后续可考虑确认无引用后删除，减少维护负担。
- 仓库内存在 `.vue.js` 对应产物和 `tsconfig.tsbuildinfo` 变更，属于构建产物，提交前需要确认是否纳入版本控制策略。

## Recommended First Step Tomorrow

1. 手工打开游客界面，验证以下场景：
   - 首次进入时列表是否立即出现。
   - 点击任意一篇文档后正文是否稳定显示。
   - 连续切换多篇文档时是否出现空白预览或旧内容残留。
2. 手工打开管理员界面，验证以下场景：
   - 点击不同文档时是否仅右侧局部加载。
   - Markdown 与 HTML 预览滚动联动是否正常。
   - 预览区是否只剩一套内部滚动条。
3. 如果游客页仍有个别空白文档，下一步直接排查该文档接口返回的 `previewHtml` / `markdownContent` 内容本身，而不是继续改页面框架。

---

## Date

- 2026-04-09

## Today

- 游客界面搜索能力扩展为“标题 + 业务领域 + 效力层级 + 正文内容”联合检索：
  - 后端搜索结果支持返回正文上下文摘要。
  - 前端结果列表显示命中片段，便于人工判断是否为目标法规。
- 游客界面正文搜索体验收敛为“稳定优先”方案：
  - 保留结果列表摘要高亮。
  - 保留右侧正文关键字高亮，便于手动滚动查找。
  - `上一处 / 下一处` 最终改为调用 iframe 内原生 `window.find()`，不再维护自定义锚点跳转链路。
  - 之前那套 `searchAnchorId`、段落锚点注入、摘要到正文的手算定位逻辑已清掉，减少系统厚度。
- 游客界面正文预览继续做了稳定性修复：
  - 收紧 iframe 自动高度计算，避免正文结束后还出现额外空白滚动区。
  - 游客附件下载入口从正文顶部挪到底部，更符合阅读顺序。
  - 搜索框新增清空 `X` 按钮。
  - 左侧“法规检索 / 文档数”信息区已改为居中显示。
- 管理员界面新增附件能力，并做了更省空间的入口收口：
  - 后端新增文档附件字段与上传/删除/下载接口。
  - 新增迁移 `0013_document_attachments.sql`。
  - 管理员页的附件入口不再独占一整块面板，而是收进 Markdown 编辑区标题右侧。
  - 点击 `附件` 后展开紧凑面板，支持上传、下载、删除。
- 页面设计做了一轮统一收敛，参考 `awesome-design-md-main/design-md/tesla`：
  - `App.vue`、`GuestPage.vue`、`AdminPage.vue` 改为更克制的白底平面风格。
  - 统一更小圆角、弱阴影甚至零阴影、单一蓝色主行动色。
  - 结果列表、筛选区、预览区、按钮与弹窗都开始向同一套语言靠拢。
- 代码层继续抽薄：
  - 新增 `apps/frontend/src/lib/preview-render.ts`，收拢管理员/游客预览共用的 Markdown 预处理与 HTML 拼装逻辑。
  - 前端游客页里之前恒为 `true` 的本地关键字过滤壳子已删除。
  - 部分仅服务于失败跳转方案的搜索字段和预览注入逻辑已删除。

## Files Touched

- `apps/backend/src/modules/document/document-preview.util.ts`
- `apps/backend/src/modules/document/document.controller.ts`
- `apps/backend/src/modules/document/document.service.ts`
- `apps/backend/src/modules/document/entities/document.entity.ts`
- `apps/backend/src/modules/search/public-document.controller.ts`
- `apps/backend/src/modules/search/search.service.ts`
- `apps/frontend/src/App.vue`
- `apps/frontend/src/components/AdminDocPreview.vue`
- `apps/frontend/src/components/GuestDocPreview.vue`
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/lib/preview-render.ts`
- `apps/frontend/src/stores/workspace.ts`
- `apps/frontend/src/views/AdminPage.vue`
- `apps/frontend/src/views/GuestPage.vue`
- `db/migrations/0013_document_attachments.sql`
- `static/css/cn-gov-doc.css`

## Current Expected Behavior

- 游客界面支持根据正文内容检索法规，结果列表应显示对应上下文摘要。
- 游客界面点击搜索结果后，右侧正文不再强依赖自定义跳转链路，但应保留关键字高亮，便于人工滚动定位。
- 游客界面 `上一处 / 下一处` 现在走原生 `window.find()`，命中切换能力依赖浏览器内核而不是业务侧锚点。
- 游客界面正文底部应展示附件下载区，而不是在正文顶部抢占空间。
- 管理员界面选中文档后，可在 Markdown 标题栏右侧打开附件面板并执行附件上传/下载/删除。
- 系统整体视觉已向更统一的极简平面风格收敛，游客页与管理员页不应再呈现两套割裂的视觉语言。

## Validation Done

- 已执行 `npm --workspace apps/frontend run build`，当前通过。
- 附件能力对应迁移文件已准备为 `db/migrations/0013_document_attachments.sql`，若目标环境未执行迁移，附件接口不可正常验证。

## Known Risks / Things To Verify Tomorrow

- 游客界面的 `window.find()` 受浏览器实现影响，虽然比自定义锚点稳定，但跨浏览器一致性仍需要人工验证。
- 需要人工验证正文关键字高亮是否会因某些老文档的 `persistedHtml` 结构过碎而出现漏标。
- 需要人工验证附件在游客页底部展示时，对超长正文、无附件文档、多个附件文档的排版是否一致。
- 仓库内仍存在 `.vue.js` / `.js` 镜像文件与 `tsconfig.tsbuildinfo` 变更，提交前仍要确认哪些属于构建产物、哪些是实际源码。
- `request.md` 当前已删除，如果里面还有未迁移的需求说明，需要确认是否已被 `dev.md` 或其他文档替代。

## Recommended First Step Tomorrow

1. 手工验证游客界面搜索链路：
   - 搜索正文关键字后，结果列表是否出现上下文摘要。
   - 右侧正文高亮是否稳定。
   - `上一处 / 下一处` 是否至少在当前主浏览器中可用。
2. 手工验证管理员附件链路：
   - 选中文档后，标题栏 `附件` 按钮是否可见。
   - 上传后附件是否能立刻出现在紧凑面板中。
   - 游客页底部是否能正常下载对应附件。
3. 如果继续做“系统抽薄”，优先检查：
   - `workspace.ts` 中管理员/游客初始化和详情加载逻辑是否还能进一步收敛。
   - 前端残留的 `.vue.js` / `.js` 镜像文件是否仍被引用，能否彻底退出版本控制。
