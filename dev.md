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

