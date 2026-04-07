<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import FaIcon from "../components/FaIcon.vue";
import GovDocPreview from "../components/GovDocPreview.vue";
import WorkspaceTree from "../components/WorkspaceTree.vue";
import { api } from "../lib/api";
import { useWorkspaceStore, type WorkspaceTreeNode } from "../stores/workspace";

const workspace = useWorkspaceStore();

const search = ref("");
const sidebarCollapsed = ref(false);
const openFolders = ref<string[]>([]);
const exportBusy = ref(false);
const exportError = ref("");

const treeKeys = computed(() => {
  const keys: string[] = [];
  const walk = (nodes: WorkspaceTreeNode[]) => {
    nodes.forEach((node) => {
      keys.push(node.key);
      walk(node.children);
    });
  };
  walk(workspace.tree);
  return keys;
});

function isOpen(key: string) {
  return openFolders.value.includes(key);
}

function toggleFolder(key: string) {
  if (isOpen(key)) {
    openFolders.value = openFolders.value.filter((item) => item !== key);
    return;
  }
  openFolders.value = [...openFolders.value, key];
}

watch(
  treeKeys,
  (keys) => {
    openFolders.value = Array.from(new Set([...openFolders.value.filter((item) => keys.includes(item)), ...keys]));
  },
  { immediate: true }
);

onMounted(async () => {
  workspace.ensureInitialized();
  await workspace.loadPublicWorkspace();
});

async function exportCurrentDocument() {
  const doc = workspace.activeDocument;
  if (!doc || !/^\d+$/.test(doc.id)) {
    return;
  }

  exportBusy.value = true;
  exportError.value = "";
  try {
    const blob = await api.publicExportDocumentPdf(doc.id);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${doc.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") || "document"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : "导出失败";
  } finally {
    exportBusy.value = false;
  }
}
</script>

<template>
  <section class="workspace" :class="{ collapsed: sidebarCollapsed }">
    <aside v-if="!sidebarCollapsed" class="file-pane">
      <div class="pane-header">
        <div>
          <p class="pane-eyebrow">文件</p>
          <h2>工作区文档</h2>
        </div>
        <button type="button" class="collapse-btn icon-only" @click="sidebarCollapsed = true" aria-label="收起文档栏">
          <FaIcon name="chevron-left" fixed-width />
        </button>
      </div>

      <label class="search-box">
        <FaIcon name="magnifying-glass" fixed-width class="search-icon" />
        <input v-model="search" type="text" placeholder="过滤文件..." />
      </label>

      <div class="folder-tree">
        <WorkspaceTree
          :nodes="workspace.tree"
          :active-id="workspace.activeId"
          :search="search"
          :open-keys="openFolders"
          @toggle="toggleFolder"
          @select="workspace.setActive($event.id)"
        />
      </div>
    </aside>

    <aside v-else class="sidebar-collapsed">
      <button type="button" class="sidebar-handle" @click="sidebarCollapsed = false">
        <FaIcon name="chevron-right" fixed-width />
        <span>文档列表</span>
      </button>
    </aside>

    <section class="editor-pane">
      <header class="editor-tabs">
        <div class="editor-topline">
          <button type="button" class="tab active">
            <FaIcon name="file-lines" fixed-width />
            <span>{{ workspace.activeDocument?.title || "未选择文档" }}</span>
          </button>
        </div>
        <div class="guest-actions">
          <button
            v-if="/^\d+$/.test(workspace.activeDocument?.id || '')"
            type="button"
            class="export-btn"
            :disabled="exportBusy"
            @click="exportCurrentDocument"
          >
            <FaIcon name="file-arrow-down" fixed-width />
            <span>{{ exportBusy ? "导出中..." : "导出文档" }}</span>
          </button>
        </div>
      </header>

      <article class="editor-surface">
        <p v-if="exportError" class="guest-banner error">{{ exportError }}</p>
        <div v-if="workspace.activeDocument" class="guest-preview-shell">
          <GovDocPreview
            :source="workspace.activeDocument.markdownSource"
            :persisted-html="workspace.activeDocument.previewHtml"
            auto-height
          />
        </div>
        <div v-else class="guest-empty-state">
          <p>请选择左侧文档开始浏览。</p>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.workspace {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  background: var(--app-bg);
  color: var(--text-primary);
  overflow: hidden;
  align-items: stretch;
}

.workspace.collapsed {
  grid-template-columns: 44px minmax(0, 1fr);
}

.file-pane {
  border-right: 1px solid var(--border-color);
  background: linear-gradient(180deg, color-mix(in srgb, var(--panel-bg) 92%, #000 8%), var(--panel-bg));
  padding: 14px 12px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 8px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  align-self: stretch;
}

.pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 30px;
}

.pane-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
}

.pane-eyebrow {
  margin: 0 0 2px;
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.collapse-btn,
.sidebar-handle {
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  border-radius: 8px;
  min-height: 34px;
  padding: 8px 10px;
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.sidebar-collapsed {
  border-right: 1px solid var(--border-color);
  background: var(--panel-bg);
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 0;
  min-height: 0;
}

.sidebar-handle {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  padding: 14px 6px;
}

.search-box {
  position: relative;
  width: 100%;
  min-width: 0;
  padding: 0;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.search-box input {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--input-border) 72%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--input-bg) 72%, var(--panel-header-bg) 28%);
  color: var(--text-primary);
  min-height: 30px;
  padding: 6px 10px 6px 30px;
  font: inherit;
  font-size: 12px;
  transition: border-color 120ms ease, background-color 120ms ease;
}

.search-box input:focus {
  outline: none;
  border-color: var(--nav-active-border);
  background: color-mix(in srgb, var(--input-bg) 84%, var(--panel-bg) 16%);
}

.icon-only {
  width: 34px;
  height: 34px;
  justify-content: center;
  padding: 0;
  flex: 0 0 auto;
}

.folder-tree {
  display: block;
  overflow: auto;
  height: 100%;
  max-height: 100%;
  padding-top: 4px;
  padding-right: 2px;
  min-height: 0;
}

.collapse-btn :deep(i),
.sidebar-handle :deep(i),
.tab :deep(i),
.search-icon {
  width: 14px;
  min-width: 14px;
}

.editor-pane {
  background: var(--panel-muted-bg);
  display: grid;
  grid-template-rows: 44px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  align-self: stretch;
}

.editor-tabs {
  border-bottom: 1px solid var(--border-color);
  padding: 0 12px;
  display: flex;
  justify-content: space-between;
  align-items: end;
  background: var(--panel-header-bg);
}

.editor-topline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tab {
  border: 0;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  background: var(--tab-bg);
  color: var(--text-primary);
  padding: 10px 14px;
  font: inherit;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tab.active {
  background: var(--panel-muted-bg);
}

.guest-actions {
  display: inline-flex;
  align-items: center;
  padding-bottom: 6px;
}

.export-btn {
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  border-radius: 8px;
  min-height: 34px;
  padding: 0 12px;
  font: inherit;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.export-btn:hover {
  background: var(--hover-bg);
}

.export-btn:disabled {
  opacity: 0.65;
  cursor: default;
}

.editor-surface {
  padding: 20px 24px 24px;
  overflow: auto;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto auto;
  gap: 10px;
}

.guest-preview-shell {
  min-height: 0;
  overflow: visible;
}

.guest-banner {
  margin: 0;
  min-height: 18px;
  color: var(--text-secondary);
  font-size: 12px;
}

.guest-banner.error {
  color: #d06a6a;
}

.guest-empty-state {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-size: 14px;
}

.guest-empty-state p {
  margin: 0;
}

@media (max-width: 960px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .file-pane {
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }

  .workspace.collapsed {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .editor-surface {
    padding: 14px 12px 16px;
  }
}
</style>
