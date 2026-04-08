<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import FaIcon from "../components/FaIcon.vue";
import GuestDocPreview from "../components/GuestDocPreview.vue";
import type { DocumentTaxonomyNode } from "../lib/document-taxonomy";
import { api } from "../lib/api";
import { useWorkspaceStore, type WorkspaceDoc } from "../stores/workspace";

const workspace = useWorkspaceStore();

const search = ref("");
const sidebarCollapsed = ref(false);
const exportBusy = ref(false);
const exportError = ref("");
const activeBusinessPath = ref<string[]>([]);
const activeLegalLevel = ref("");
const expandedBusinessKeys = ref<string[]>([]);

const legalTabs = computed(() => workspace.documentTaxonomy.legalLevels.map((item) => item.name));

const businessRoots = computed(() => workspace.documentTaxonomy.businessDomains);

const documentTotal = computed(() => workspace.docs.length);

function docMatchesKeyword(doc: WorkspaceDoc) {
  const keyword = search.value.trim().toLowerCase();
  return (
    !keyword ||
    doc.title.toLowerCase().includes(keyword) ||
    doc.businessPath.join("/").toLowerCase().includes(keyword) ||
    doc.legalPath.join("/").toLowerCase().includes(keyword) ||
    doc.archivePath.toLowerCase().includes(keyword)
  );
}

const filteredDocs = computed(() => {
  return workspace.docs.filter((doc) => {
    const matchesLegal = !activeLegalLevel.value || doc.legalPath[0] === activeLegalLevel.value;
    const matchesBusiness =
      activeBusinessPath.value.length === 0 ||
      activeBusinessPath.value.every((segment, index) => doc.businessPath[index] === segment);
    const matchesKeyword = docMatchesKeyword(doc);
    return matchesLegal && matchesBusiness && matchesKeyword;
  });
});

const activeFilteredDocument = computed(() => {
  const doc = workspace.activeDocument;
  if (!doc || !/^\d+$/.test(doc.id)) {
    return filteredDocs.value[0] ?? null;
  }
  const matched = filteredDocs.value.find((item) => item.id === doc.id);
  if (!matched) {
    return filteredDocs.value[0] ?? null;
  }
  return {
    ...matched,
    ...doc
  };
});

const activeBusinessSummary = computed(() => activeBusinessPath.value.join(" / ") || "全部业务领域");
const activeLegalSummary = computed(() => activeLegalLevel.value || "全部效力层级");

const activeResultMeta = computed(() => {
  const doc = activeFilteredDocument.value;
  if (!doc) {
    return [];
  }
  return [
    doc.legalPath.join(" / ") || "未设置效力层级",
    doc.businessPath.join(" / ") || "未设置业务领域",
    doc.updatedAt ? `更新于 ${formatDate(doc.updatedAt)}` : ""
  ].filter(Boolean);
});

function makeBusinessKey(path: string[]) {
  return path.join("/");
}

function countDocsForBusiness(path: string[]) {
  return workspace.docs.filter((doc) => {
    const matchesPath = path.every((segment, index) => doc.businessPath[index] === segment);
    const matchesLegal = !activeLegalLevel.value || doc.legalPath[0] === activeLegalLevel.value;
    return matchesPath && matchesLegal && docMatchesKeyword(doc);
  }).length;
}

function countDocsForLegal(level: string) {
  return workspace.docs.filter((doc) => {
    const matchesLegal = doc.legalPath[0] === level;
    const matchesBusiness =
      activeBusinessPath.value.length === 0 ||
      activeBusinessPath.value.every((segment, index) => doc.businessPath[index] === segment);
    return matchesLegal && matchesBusiness && docMatchesKeyword(doc);
  }).length;
}

function countDocsForAllLegal() {
  return workspace.docs.filter((doc) => {
    const matchesBusiness =
      activeBusinessPath.value.length === 0 ||
      activeBusinessPath.value.every((segment, index) => doc.businessPath[index] === segment);
    return matchesBusiness && docMatchesKeyword(doc);
  }).length;
}

function countDocsForAllBusiness() {
  return workspace.docs.filter((doc) => {
    const matchesLegal = !activeLegalLevel.value || doc.legalPath[0] === activeLegalLevel.value;
    return matchesLegal && docMatchesKeyword(doc);
  }).length;
}

function isBusinessPathActive(path: string[]) {
  return path.length === activeBusinessPath.value.length && path.every((segment, index) => activeBusinessPath.value[index] === segment);
}

function isBusinessExpanded(path: string[]) {
  return expandedBusinessKeys.value.includes(makeBusinessKey(path));
}

function toggleBusinessExpanded(path: string[]) {
  const key = makeBusinessKey(path);
  if (isBusinessExpanded(path)) {
    expandedBusinessKeys.value = expandedBusinessKeys.value.filter((item) => item !== key);
    return;
  }
  expandedBusinessKeys.value = [...expandedBusinessKeys.value, key];
}

function selectBusinessPath(path: string[]) {
  activeBusinessPath.value = path;
  for (let index = 0; index < path.length; index += 1) {
    const key = makeBusinessKey(path.slice(0, index + 1));
    if (!expandedBusinessKeys.value.includes(key)) {
      expandedBusinessKeys.value = [...expandedBusinessKeys.value, key];
    }
  }
}

function clearBusinessPath() {
  activeBusinessPath.value = [];
}

function setLegalLevel(level: string) {
  activeLegalLevel.value = level;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function summarizePath(path: string[]) {
  return path.join(" / ") || "未设置";
}

async function selectDocument(doc: WorkspaceDoc) {
  workspace.setActive(doc.id);
  try {
    await workspace.loadDocumentDetail(doc.id);
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : "加载文档失败";
  }
}

watch(
  businessRoots,
  (nodes) => {
    const nextKeys: string[] = [];
    const walk = (items: DocumentTaxonomyNode[], parent: string[] = []) => {
      items.forEach((item) => {
        const path = [...parent, item.name];
        if (parent.length === 0) {
          nextKeys.push(makeBusinessKey(path));
        }
        walk(item.children, path);
      });
    };
    walk(nodes);
    expandedBusinessKeys.value = Array.from(new Set([...expandedBusinessKeys.value, ...nextKeys]));
  },
  { immediate: true }
);

watch(
  filteredDocs,
  (docs) => {
    const current = workspace.activeDocument;
    if (docs.length === 0) {
      return;
    }
    if (!current || !/^\d+$/.test(current.id) || !docs.some((doc) => doc.id === current.id)) {
      void selectDocument(docs[0]);
    }
  },
  { immediate: true }
);

onMounted(async () => {
  workspace.ensureInitialized();
  await workspace.loadPublicWorkspace();
});

async function exportCurrentDocument() {
  const doc = activeFilteredDocument.value;
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
    link.download = `${doc.title.replace(/[<>:\"/\\\\|?*\\x00-\\x1F]/g, "_") || "document"}.pdf`;
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

function businessNodeHasMatches(path: string[]) {
  return workspace.docs.some((doc) => {
    const matchesPath = path.every((segment, index) => doc.businessPath[index] === segment);
    const matchesLegal = !activeLegalLevel.value || doc.legalPath[0] === activeLegalLevel.value;
    return matchesPath && matchesLegal && docMatchesKeyword(doc);
  });
}

function isDocumentActive(doc: WorkspaceDoc) {
  return activeFilteredDocument.value?.id === doc.id;
}
</script>

<template>
  <section class="guest-shell" :class="{ collapsed: sidebarCollapsed }">
    <section class="filter-bar">
      <div class="filter-bar-main">
        <div class="filter-title">
          <strong>
            <FaIcon name="books" fixed-width />
            <span>法规检索</span>
          </strong>
          <span>{{ documentTotal }} 份文档</span>
        </div>

        <label class="hero-search compact-search">
          <FaIcon name="magnifying-glass" fixed-width />
          <input v-model="search" type="text" placeholder="搜索标题、业务领域、效力层级..." />
        </label>

        <nav class="legal-nav" aria-label="效力层级筛选">
          <button type="button" class="legal-pill" :class="{ active: !activeLegalLevel }" @click="setLegalLevel('')">
            <span>全部</span>
            <strong>{{ countDocsForAllLegal() }}</strong>
          </button>
          <button
            v-for="level in legalTabs"
            :key="level"
            type="button"
            class="legal-pill"
            :class="{ active: activeLegalLevel === level }"
            @click="setLegalLevel(level)"
          >
            <span>{{ level }}</span>
            <strong>{{ countDocsForLegal(level) }}</strong>
          </button>
        </nav>
      </div>

      <button
        v-if="activeFilteredDocument"
        type="button"
        class="hero-action compact-action"
        :disabled="exportBusy"
        @click="exportCurrentDocument"
      >
        <FaIcon name="file-arrow-down" fixed-width />
        <span>{{ exportBusy ? "导出中..." : "导出文档" }}</span>
      </button>
    </section>

    <section class="content-grid">
      <aside v-if="!sidebarCollapsed" class="business-panel">
        <div class="panel-card taxonomy-panel">
          <div class="panel-header">
            <div>
              <p class="panel-eyebrow">业务领域</p>
              <h2>
                <FaIcon name="folder-tree" fixed-width />
                <span>二维筛选</span>
              </h2>
            </div>
            <button type="button" class="icon-btn" @click="sidebarCollapsed = true" aria-label="收起筛选栏">
              <FaIcon name="angles-left" fixed-width />
            </button>
          </div>

          <button type="button" class="all-business-btn" :class="{ active: activeBusinessPath.length === 0 }" @click="clearBusinessPath">
            <span class="all-business-label">
              <FaIcon name="layer-group" fixed-width />
              <span>全部业务领域</span>
            </span>
            <strong>{{ countDocsForAllBusiness() }}</strong>
          </button>

          <div class="taxonomy-tree">
            <template v-for="node in businessRoots" :key="node.name">
              <div class="taxonomy-group">
                <div
                  class="taxonomy-node"
                  :class="{ active: isBusinessPathActive([node.name]), muted: !businessNodeHasMatches([node.name]) }"
                >
                  <button
                    v-if="node.children.length"
                    type="button"
                    class="toggle-btn"
                    @click="toggleBusinessExpanded([node.name])"
                  >
                    <FaIcon :name="isBusinessExpanded([node.name]) ? 'minus' : 'plus'" fixed-width />
                  </button>
                  <span v-else class="toggle-placeholder"></span>
                  <button type="button" class="node-label" @click="selectBusinessPath([node.name])">
                    <span>{{ node.name }}</span>
                    <strong>{{ countDocsForBusiness([node.name]) }}</strong>
                  </button>
                </div>

                <div v-if="node.children.length && isBusinessExpanded([node.name])" class="taxonomy-children">
                  <template v-for="child in node.children" :key="`${node.name}/${child.name}`">
                    <div
                      class="taxonomy-node child"
                      :class="{
                        active: isBusinessPathActive([node.name, child.name]),
                        muted: !businessNodeHasMatches([node.name, child.name])
                      }"
                    >
                      <button
                        v-if="child.children.length"
                        type="button"
                        class="toggle-btn"
                        @click="toggleBusinessExpanded([node.name, child.name])"
                      >
                        <FaIcon :name="isBusinessExpanded([node.name, child.name]) ? 'minus' : 'plus'" fixed-width />
                      </button>
                      <span v-else class="toggle-placeholder"></span>
                      <button type="button" class="node-label" @click="selectBusinessPath([node.name, child.name])">
                        <span>{{ child.name }}</span>
                        <strong>{{ countDocsForBusiness([node.name, child.name]) }}</strong>
                      </button>
                    </div>

                    <div
                      v-for="grandchild in child.children"
                      v-show="isBusinessExpanded([node.name, child.name])"
                      :key="`${node.name}/${child.name}/${grandchild.name}`"
                      class="taxonomy-node grandchild"
                      :class="{
                        active: isBusinessPathActive([node.name, child.name, grandchild.name]),
                        muted: !businessNodeHasMatches([node.name, child.name, grandchild.name])
                      }"
                    >
                      <span class="toggle-placeholder"></span>
                      <button
                        type="button"
                        class="node-label"
                        @click="selectBusinessPath([node.name, child.name, grandchild.name])"
                      >
                        <span>{{ grandchild.name }}</span>
                        <strong>{{ countDocsForBusiness([node.name, child.name, grandchild.name]) }}</strong>
                      </button>
                    </div>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>
      </aside>

      <aside v-else class="business-panel-collapsed">
        <button type="button" class="collapsed-btn" @click="sidebarCollapsed = false">
          <FaIcon name="angles-right" fixed-width />
          <span>筛选</span>
        </button>
      </aside>

      <section class="results-panel">
        <div class="panel-card results-card">
          <div class="panel-header">
            <div>
              <p class="panel-eyebrow">结果列表</p>
              <h2>
                <FaIcon name="list-ul" fixed-width />
                <span>{{ activeLegalSummary }}</span>
              </h2>
            </div>
            <span class="result-badge">{{ filteredDocs.length }} 条结果</span>
          </div>

          <div class="filter-summary">
            <span class="summary-chip">
              <FaIcon name="scale-balanced" fixed-width />
              <span>{{ activeLegalSummary }}</span>
            </span>
            <span class="summary-chip">
              <FaIcon name="folder-tree" fixed-width />
              <span>{{ activeBusinessSummary }}</span>
            </span>
          </div>

          <div class="results-list">
            <button
              v-for="doc in filteredDocs"
              :key="doc.id"
              type="button"
              class="result-item"
              :class="{ active: isDocumentActive(doc) }"
              @click="selectDocument(doc)"
            >
              <div class="result-icon">
                <FaIcon name="file-lines" fixed-width />
              </div>
              <div class="result-copy">
                <strong>{{ doc.title }}</strong>
                <p>{{ summarizePath(doc.legalPath) }}</p>
                <span>{{ summarizePath(doc.businessPath) }}</span>
              </div>
            </button>

            <div v-if="filteredDocs.length === 0" class="empty-state">
              <FaIcon name="inbox" fixed-width />
              <strong>当前筛选条件下暂无文档</strong>
              <span>可以切换效力层级、业务领域或清空关键字后重试。</span>
            </div>
          </div>
        </div>
      </section>

      <section class="preview-panel">
        <div class="panel-card preview-card">
          <div class="panel-header preview-header">
            <div>
              <p class="panel-eyebrow">文档预览</p>
              <h2>
                <FaIcon name="file-lines" fixed-width />
                <span>{{ activeFilteredDocument?.title || "未选择文档" }}</span>
              </h2>
            </div>
            <div class="preview-meta">
              <span v-for="item in activeResultMeta" :key="item">{{ item }}</span>
            </div>
          </div>

          <p v-if="exportError" class="error-banner">{{ exportError }}</p>

          <div v-if="activeFilteredDocument" class="preview-body">
            <div v-if="workspace.activeDocumentLoading" class="preview-loading">
              <FaIcon name="spinner" fixed-width class="spin" />
              <span>正在加载文档详情...</span>
            </div>
            <GuestDocPreview
              :source="activeFilteredDocument.markdownSource ?? ''"
              :persisted-html="activeFilteredDocument.previewHtml"
            />
          </div>
          <div v-else class="empty-preview">
            <FaIcon name="file-circle-xmark" fixed-width />
            <p>当前没有可预览的文档。</p>
          </div>
        </div>
      </section>
    </section>
  </section>
</template>

<style scoped>
.guest-shell {
  --guest-page-bg: linear-gradient(
    180deg,
    color-mix(in srgb, var(--app-bg) 92%, var(--panel-bg) 8%) 0%,
    color-mix(in srgb, var(--panel-bg) 86%, var(--app-bg) 14%) 100%
  );
  --guest-card-bg: color-mix(in srgb, var(--panel-muted-bg) 92%, var(--panel-bg) 8%);
  --guest-card-bg-strong: color-mix(in srgb, var(--panel-bg) 86%, var(--panel-header-bg) 14%);
  --guest-card-border: color-mix(in srgb, var(--border-color) 82%, transparent);
  --guest-shadow: 0 8px 18px color-mix(in srgb, #000 10%, transparent);
  --guest-surface: color-mix(in srgb, var(--panel-muted-bg) 94%, var(--topbar-bg) 6%);
  --guest-surface-soft: color-mix(in srgb, var(--panel-header-bg) 86%, var(--panel-bg) 14%);
  --guest-surface-strong: color-mix(in srgb, var(--button-bg) 92%, var(--panel-bg) 8%);
  --guest-text-strong: var(--text-primary);
  --guest-text: var(--text-secondary);
  --guest-text-muted: var(--text-muted);
  --guest-accent: var(--accent-bg);
  --guest-accent-soft: color-mix(in srgb, var(--accent-bg) 12%, transparent);
  --guest-accent-strong: color-mix(in srgb, var(--accent-bg) 82%, #0b5e95 18%);
  --guest-accent-text: var(--accent-text);
  --guest-badge-bg: color-mix(in srgb, var(--button-bg) 88%, var(--panel-header-bg) 12%);
  --guest-badge-strong-bg: color-mix(in srgb, var(--panel-header-bg) 68%, var(--button-bg) 32%);
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  padding: 12px 18px 18px;
  background: var(--guest-page-bg);
  overflow: hidden;
}

.guest-shell.collapsed .content-grid {
  grid-template-columns: 64px 360px minmax(0, 1fr);
}

.filter-bar,
.panel-card,
.legal-nav {
  border: 1px solid var(--guest-card-border);
  box-shadow: var(--guest-shadow);
}

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 10px;
  border-radius: 8px;
  background: linear-gradient(180deg, var(--guest-card-bg), var(--guest-card-bg-strong));
}

.panel-eyebrow {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.filter-bar-main {
  min-width: 0;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: auto minmax(280px, 360px) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.filter-title {
  min-width: fit-content;
  display: grid;
  gap: 2px;
  padding: 0 6px;
}

.filter-title strong {
  font-size: 13px;
  color: var(--guest-text-strong);
  line-height: 1.1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.filter-title span {
  font-size: 11px;
  color: var(--guest-text-muted);
}

.hero-search {
  min-height: 38px;
  padding: 0 12px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--guest-surface);
  border: 1px solid var(--guest-card-border);
  color: var(--guest-text);
}

.compact-search {
  min-width: 0;
}

.hero-search input {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--guest-text-strong);
  font: inherit;
  font-size: 12px;
}

.hero-search input:focus {
  outline: none;
}

.hero-action {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--guest-card-border);
  border-radius: 6px;
  background: linear-gradient(135deg, var(--guest-surface), var(--guest-surface-soft));
  color: var(--guest-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
}

.compact-action {
  flex: 0 0 auto;
}

.hero-action:disabled {
  opacity: 0.6;
  cursor: default;
}

.legal-nav {
  min-width: 0;
  min-height: 38px;
  padding: 4px;
  border-radius: 6px;
  background: var(--guest-surface-soft);
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
}

.legal-pill {
  min-width: fit-content;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--guest-text);
  font: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 120ms ease, background-color 120ms ease, border-color 120ms ease;
  font-size: 12px;
}

.legal-pill strong {
  min-width: 20px;
  height: 20px;
  border-radius: 4px;
  display: inline-grid;
  place-items: center;
  background: var(--guest-badge-strong-bg);
  font-size: 11px;
}

.legal-pill.active {
  background: var(--guest-accent-strong);
  border-color: transparent;
  color: var(--guest-accent-text);
  transform: translateY(-1px);
}

.legal-pill.active strong {
  background: rgba(255, 255, 255, 0.18);
}

.content-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 292px 360px minmax(0, 1fr);
  gap: 14px;
}

.business-panel,
.results-panel,
.preview-panel,
.business-panel-collapsed {
  min-height: 0;
}

.panel-card {
  height: 100%;
  min-height: 0;
  border-radius: 8px;
  background: var(--guest-card-bg);
  display: grid;
  overflow: hidden;
}

.taxonomy-panel,
.results-card,
.preview-card {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.preview-card {
  background: linear-gradient(180deg, var(--guest-card-bg), var(--guest-card-bg-strong));
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 16px 10px;
}

.panel-header h2 {
  margin: 4px 0 0;
  font-size: 16px;
  line-height: 1.2;
  color: var(--guest-text-strong);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.panel-eyebrow {
  color: var(--guest-text-muted);
  font-size: 10px;
}

.icon-btn,
.collapsed-btn,
.toggle-btn,
.all-business-btn,
.node-label,
.result-item {
  font: inherit;
}

.icon-btn,
.collapsed-btn {
  border: 1px solid var(--guest-card-border);
  background: var(--guest-surface);
  color: var(--guest-text);
  cursor: pointer;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  display: inline-grid;
  place-items: center;
}

.all-business-btn {
  margin: 0 16px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--guest-card-border);
  border-radius: 6px;
  background: var(--guest-surface);
  color: var(--guest-text-strong);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 12px;
}

.all-business-btn.active {
  background: var(--guest-accent-soft);
  border-color: color-mix(in srgb, var(--guest-accent) 34%, var(--guest-card-border) 66%);
}

.all-business-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.taxonomy-tree,
.results-list,
.preview-body {
  min-height: 0;
  overflow: auto;
}

.preview-body {
  position: relative;
  overflow: auto;
}

.taxonomy-tree {
  padding: 12px 12px 16px 16px;
  display: grid;
  gap: 8px;
}

.taxonomy-group {
  display: grid;
  gap: 4px;
}

.taxonomy-children {
  display: grid;
  gap: 4px;
}

.taxonomy-node {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.taxonomy-node.child {
  padding-left: 12px;
}

.taxonomy-node.grandchild {
  padding-left: 30px;
}

.taxonomy-node.muted .node-label {
  opacity: 0.52;
}

.taxonomy-node.active .node-label {
  background: var(--guest-accent-strong);
  color: var(--guest-accent-text);
  border-color: transparent;
}

.taxonomy-node.active .node-label strong {
  background: rgba(255, 255, 255, 0.18);
}

.toggle-btn,
.toggle-placeholder {
  width: 20px;
  height: 20px;
}

.toggle-btn {
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--guest-text);
  display: inline-grid;
  place-items: center;
  cursor: pointer;
  font-size: 11px;
  padding: 0;
}

.toggle-placeholder {
  display: block;
}

.node-label {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--guest-card-border);
  border-radius: 4px;
  background: var(--guest-surface);
  color: var(--guest-text-strong);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  font-size: 12px;
}

.node-label span {
  text-align: left;
}

.node-label strong {
  min-width: 22px;
  height: 22px;
  border-radius: 4px;
  display: inline-grid;
  place-items: center;
  background: var(--guest-badge-strong-bg);
  font-size: 11px;
}

.filter-summary {
  padding: 0 16px 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.summary-chip,
.result-badge {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.summary-chip {
  background: var(--guest-surface-soft);
  color: var(--guest-text);
  border: 1px solid var(--guest-card-border);
}

.result-badge {
  background: var(--guest-accent-soft);
  color: var(--guest-accent);
}

.results-list {
  padding: 0 12px 16px;
  display: grid;
  gap: 2px;
}

.result-item {
  width: 100%;
  padding: 8px 8px 8px 6px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 10px;
  cursor: pointer;
  text-align: left;
  align-items: start;
}

.result-item.active {
  background: var(--guest-accent-soft);
}

.result-icon {
  width: 24px;
  height: 24px;
  border-radius: 0;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--guest-text-muted);
  font-size: 11px;
}

.result-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.result-copy strong,
.result-copy p,
.result-copy span {
  margin: 0;
}

.result-copy strong {
  font-size: 13px;
  color: var(--guest-text-strong);
  line-height: 1.35;
  font-weight: 600;
}

.result-copy p {
  font-size: 11px;
  color: var(--guest-text);
}

.result-copy span {
  font-size: 11px;
  color: var(--guest-text-muted);
}

.preview-header {
  padding-bottom: 12px;
}

.preview-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  max-width: 420px;
}

.preview-meta span {
  min-height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  background: var(--guest-surface-soft);
  color: var(--guest-text);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
}

.preview-body {
  padding: 0 12px 12px;
}

.preview-loading {
  min-height: 96px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 12px;
  color: var(--guest-text-muted);
  font-size: 12px;
}

.spin {
  animation: guest-spin 0.9s linear infinite;
}

.error-banner {
  margin: 0;
  padding: 0 16px 10px;
  color: #d06a6a;
  font-size: 11px;
}

.empty-state,
.empty-preview {
  min-height: 180px;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 8px;
  color: var(--guest-text-muted);
}

.empty-state strong,
.empty-preview p {
  margin: 0;
}

@keyframes guest-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.business-panel-collapsed {
  display: flex;
}

.collapsed-btn {
  width: 100%;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
}

@media (max-width: 1360px) {
  .content-grid {
    grid-template-columns: 280px 320px minmax(0, 1fr);
  }
}

@media (max-width: 1120px) {
  .guest-shell,
  .guest-shell.collapsed {
    padding: 12px;
  }

  .filter-bar {
    align-items: stretch;
  }

  .filter-bar,
  .filter-bar-main {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .content-grid,
  .guest-shell.collapsed .content-grid {
    grid-template-columns: 1fr;
  }

  .business-panel-collapsed {
    min-height: 76px;
  }

  .results-panel {
    min-height: 360px;
  }

  .preview-panel {
    min-height: 520px;
  }
}
</style>
