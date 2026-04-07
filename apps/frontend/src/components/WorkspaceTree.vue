<script setup lang="ts">
import { computed, ref } from "vue";
import FaIcon from "./FaIcon.vue";
import type { WorkspaceDoc, WorkspaceTreeNode } from "../stores/workspace";

const props = defineProps<{
  nodes: WorkspaceTreeNode[];
  activeId: string;
  activeFolderPath?: string;
  search?: string;
  openKeys: string[];
  baseDepth?: number;
  canDelete?: boolean;
  selectedIds?: string[];
}>();

const emit = defineEmits<{
  (event: "toggle", key: string): void;
  (event: "select-folder", path: string): void;
  (event: "select", doc: WorkspaceDoc): void;
  (event: "delete", doc: WorkspaceDoc): void;
  (event: "toggle-select", doc: WorkspaceDoc): void;
  (event: "move", payload: { doc: WorkspaceDoc; targetPath: string }): void;
}>();

const keyword = computed(() => props.search?.trim().toLowerCase() ?? "");
const depth = computed(() => props.baseDepth ?? 0);
const dragTargetKey = ref("");

function matchesDocument(doc: WorkspaceDoc) {
  if (!keyword.value) return true;
  const haystack = `${doc.title} ${doc.archivePath} ${doc.businessPath.join(" ")} ${doc.legalPath.join(" ")}`.toLowerCase();
  return haystack.includes(keyword.value);
}

function filterNode(node: WorkspaceTreeNode): WorkspaceTreeNode | null {
  const filteredChildren = node.children
    .map((child) => filterNode(child))
    .filter((child): child is WorkspaceTreeNode => Boolean(child));
  const filteredDocuments = node.documents.filter(matchesDocument);
  const nodeMatches = keyword.value
    ? `${node.name} ${node.fullPath}`.toLowerCase().includes(keyword.value)
    : true;

  if (!nodeMatches && filteredChildren.length === 0 && filteredDocuments.length === 0) {
    return null;
  }

  return {
    ...node,
    children: filteredChildren,
    documents: filteredDocuments
  };
}

const visibleNodes = computed(() => props.nodes.map((node) => filterNode(node)).filter((node): node is WorkspaceTreeNode => Boolean(node)));

function isOpen(key: string) {
  return props.openKeys.includes(key);
}

function isSelected(id: string) {
  return (props.selectedIds ?? []).includes(id);
}

function handleDragStart(event: DragEvent, doc: WorkspaceDoc) {
  event.dataTransfer?.setData("text/plain", doc.id);
  event.dataTransfer?.setData("application/x-knowledge-doc-id", doc.id);
  event.dataTransfer?.setData("application/x-knowledge-doc-title", doc.title);
  event.dataTransfer?.setData("application/x-knowledge-doc-path", doc.archivePath);
  event.dataTransfer?.setData("application/x-knowledge-doc-json", JSON.stringify(doc));
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function setDragTarget(key: string) {
  dragTargetKey.value = key;
}

function clearDragTarget() {
  dragTargetKey.value = "";
}

function isDragTarget(key: string) {
  return dragTargetKey.value === key;
}

function handleFolderDragEnter(node: WorkspaceTreeNode) {
  setDragTarget(`folder:${node.fullPath}`);
  if (!isOpen(node.key)) {
    emit("toggle", node.key);
  }
}

function handleDrop(event: DragEvent, targetPath: string) {
  event.preventDefault();
  event.stopPropagation();
  const payload = event.dataTransfer?.getData("application/x-knowledge-doc-json");
  clearDragTarget();
  if (!payload) {
    const docId = event.dataTransfer?.getData("application/x-knowledge-doc-id") || event.dataTransfer?.getData("text/plain");
    if (!docId) return;
    const doc = {
      id: docId,
      title: event.dataTransfer?.getData("application/x-knowledge-doc-title") || "",
      archivePath: event.dataTransfer?.getData("application/x-knowledge-doc-path") || "",
      businessPath: [],
      legalPath: [],
      markdownSource: ""
    } satisfies WorkspaceDoc;
    emit("move", { doc, targetPath });
    return;
  }
  const doc = JSON.parse(payload) as WorkspaceDoc;
  emit("move", { doc, targetPath });
}
</script>

<template>
  <div class="tree-list">
    <section v-for="node in visibleNodes" :key="node.key" class="folder-block">
      <button
        type="button"
        class="folder-toggle"
        :class="{ active: node.fullPath === activeFolderPath, 'drop-target': isDragTarget(`folder:${node.fullPath}`) }"
        :style="{ paddingLeft: `${8 + depth * 18}px` }"
        @click="
          emit('select-folder', node.fullPath);
          emit('toggle', node.key);
        "
        @dragenter.prevent="handleFolderDragEnter(node)"
        @dragover.prevent="
          setDragTarget(`folder:${node.fullPath}`);
          $event.dataTransfer && ($event.dataTransfer.dropEffect = 'move');
        "
        @dragleave="clearDragTarget"
        @drop.stop="handleDrop($event, node.fullPath)"
      >
        <span class="folder-sign">
          <FaIcon :name="isOpen(node.key) ? 'square-minus' : 'square-plus'" fixed-width />
        </span>
        <FaIcon :name="isOpen(node.key) ? 'folder-open' : 'folder'" fixed-width class="folder-icon" />
        <span class="folder-title">{{ node.name }}</span>
        <span v-if="isDragTarget(`folder:${node.fullPath}`)" class="drop-hint">移动到此文件夹</span>
      </button>

      <div v-if="isOpen(node.key)" class="folder-children">
          <WorkspaceTree
          v-if="node.children.length > 0"
          :nodes="node.children"
          :active-id="activeId"
          :search="search"
          :open-keys="openKeys"
          :base-depth="depth + 1"
          :can-delete="canDelete"
          :active-folder-path="activeFolderPath"
          :selected-ids="selectedIds"
          @toggle="emit('toggle', $event)"
          @select-folder="emit('select-folder', $event)"
          @select="emit('select', $event)"
          @delete="emit('delete', $event)"
          @toggle-select="emit('toggle-select', $event)"
          @move="emit('move', $event)"
        />

        <div v-if="node.documents.length > 0" class="folder-files">
          <div
            v-for="doc in node.documents"
            :key="doc.id"
            class="file-row"
            :class="{ active: doc.id === activeId, 'drop-target': isDragTarget(`doc:${doc.id}`) }"
            :style="{ paddingLeft: `${44 + depth * 18}px` }"
            @dragenter.prevent="setDragTarget(`doc:${doc.id}`)"
            @dragover.prevent="
              setDragTarget(`doc:${doc.id}`);
              $event.dataTransfer && ($event.dataTransfer.dropEffect = 'move');
            "
            @dragleave="clearDragTarget"
            @drop.stop="handleDrop($event, node.fullPath)"
          >
            <button
              v-if="canDelete"
              type="button"
              class="select-action"
              :class="{ selected: isSelected(doc.id) }"
              :title="isSelected(doc.id) ? '取消选择' : '选择文档'"
              :aria-label="isSelected(doc.id) ? '取消选择文档' : '选择文档'"
              @click.stop="emit('toggle-select', doc)"
            >
              <FaIcon :name="isSelected(doc.id) ? 'square-check' : 'square'" fixed-width />
            </button>
            <button
              type="button"
              class="file-item"
              draggable="true"
              @click="emit('select', doc)"
              @dragstart="handleDragStart($event, doc)"
              @dragend="clearDragTarget"
            >
              <span class="file-icon">
                <FaIcon name="file-lines" fixed-width />
              </span>
              <span class="file-title">{{ doc.title }}</span>
            </button>
            <span v-if="isDragTarget(`doc:${doc.id}`)" class="drop-hint inline-hint">移动到此文件夹</span>
            <button
              v-if="canDelete"
              type="button"
              class="doc-action"
              title="删除文档"
              aria-label="删除文档"
              @click.stop="emit('delete', doc)"
            >
              <FaIcon name="trash-can" fixed-width />
              <span>删除</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tree-list {
  display: grid;
  gap: 1px;
  min-height: 100%;
  align-content: start;
}

.folder-block {
  display: grid;
  gap: 1px;
}

.folder-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  display: grid;
  grid-template-columns: 16px 14px minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  min-height: 28px;
  padding: 5px 6px;
  cursor: pointer;
  border-radius: 6px;
}

.folder-toggle:hover,
.file-row:hover {
  background: var(--hover-bg);
}

.folder-toggle.active {
  background: var(--active-bg);
  color: var(--text-primary);
}

.folder-toggle.drop-target,
.file-row.drop-target {
  background: color-mix(in srgb, var(--active-bg) 78%, var(--hover-bg) 22%);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px var(--nav-active-border);
}

.folder-sign {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  color: var(--text-muted);
}

.folder-icon {
  color: #c3a45c;
  font-size: 11px;
}

.folder-title {
  font-size: 12.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-children,
.folder-files {
  display: grid;
  gap: 2px;
}

.file-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  min-height: 28px;
  border-radius: 6px;
  overflow: hidden;
}

.file-row.active {
  background: var(--active-bg);
  color: var(--text-primary);
  box-shadow: inset 2px 0 0 var(--nav-active-border);
}

.file-item {
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  min-height: 28px;
  padding: 5px 8px 5px 0;
  cursor: pointer;
  min-width: 0;
}

.select-action,
.doc-action {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  min-width: 28px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
}

.select-action {
  margin-left: 6px;
}

.select-action.selected {
  color: var(--text-primary);
}

.select-action:hover,
.doc-action:hover {
  background: var(--hover-bg);
}

.doc-action:hover {
  color: #cc7272;
}

.doc-action {
  gap: 4px;
  padding: 0 6px;
  margin-right: 4px;
  font-size: 11.5px;
}

.file-icon {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-size: 11px;
}

.file-title {
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drop-hint {
  font-size: 10.5px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--active-bg) 82%, var(--panel-bg) 18%);
  border: 1px solid color-mix(in srgb, var(--nav-active-border) 78%, transparent);
  border-radius: 999px;
  padding: 2px 7px;
  white-space: nowrap;
}

.inline-hint {
  margin-right: 4px;
}

.folder-sign :deep(i),
.folder-icon,
.file-icon :deep(i),
.select-action :deep(i),
.doc-action :deep(i) {
  width: 14px;
  min-width: 14px;
}
</style>
