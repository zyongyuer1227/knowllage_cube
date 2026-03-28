<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import FaIcon from "../components/FaIcon.vue";
import GovDocPreview from "../components/GovDocPreview.vue";
import WorkspaceTree from "../components/WorkspaceTree.vue";
import { useAppSettings } from "../lib/app-settings";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useWorkspaceStore, type WorkspaceDoc, type WorkspaceTreeNode } from "../stores/workspace";

const auth = useAuthStore();
const workspace = useWorkspaceStore();
const { branding, defaultBranding, resetBranding, setBranding } = useAppSettings();

const search = ref("");
const loginError = ref("");
const statusMessage = ref("");
const openFolders = ref<string[]>([]);
const selectedDocumentIds = ref<string[]>([]);
const showSettings = ref(false);
const settingsBusy = ref(false);
const formatBusy = ref(false);
const formatProgress = ref(0);
const formatStageLabel = ref("");
const markdownTextarea = ref<HTMLTextAreaElement | null>(null);
const previewFrame = ref<InstanceType<typeof GovDocPreview> | null>(null);
const syncSource = ref<"editor" | "preview" | null>(null);
const settingsBackdropPressed = ref(false);

const settingsForm = ref({
  title: branding.title,
  subtitle: branding.subtitle,
  footer: branding.footer,
  faviconHref: branding.faviconHref
});

const loginForm = ref({
  username: "admin",
  password: "Admin@123",
  captcha: "1234"
});

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

function isFolderOpen(key: string) {
  return openFolders.value.includes(key);
}

function toggleFolder(key: string) {
  if (isFolderOpen(key)) {
    openFolders.value = openFolders.value.filter((item) => item !== key);
    return;
  }
  openFolders.value = [...openFolders.value, key];
}

const selectedCount = computed(() => selectedDocumentIds.value.length);

function toggleDocumentSelection(doc: WorkspaceDoc) {
  if (selectedDocumentIds.value.includes(doc.id)) {
    selectedDocumentIds.value = selectedDocumentIds.value.filter((id) => id !== doc.id);
    return;
  }
  selectedDocumentIds.value = [...selectedDocumentIds.value, doc.id];
}

function clearSelection() {
  selectedDocumentIds.value = [];
}

function withScrollSyncLock(source: "editor" | "preview", callback: () => void) {
  syncSource.value = source;
  callback();
  requestAnimationFrame(() => {
    if (syncSource.value === source) {
      syncSource.value = null;
    }
  });
}

function getEditorScrollRatio() {
  const textarea = markdownTextarea.value;
  if (!textarea) return 0;
  const maxScrollTop = textarea.scrollHeight - textarea.clientHeight;
  if (maxScrollTop <= 0) return 0;
  return textarea.scrollTop / maxScrollTop;
}

function setEditorScrollRatio(value: number) {
  const textarea = markdownTextarea.value;
  if (!textarea) return;
  const ratio = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const maxScrollTop = textarea.scrollHeight - textarea.clientHeight;
  textarea.scrollTop = maxScrollTop > 0 ? maxScrollTop * ratio : 0;
}

function syncPreviewFromEditor() {
  if (syncSource.value === "preview") return;
  withScrollSyncLock("editor", () => {
    previewFrame.value?.setScrollRatio(getEditorScrollRatio());
  });
}

function syncEditorFromPreview(ratio: number) {
  if (syncSource.value === "editor") return;
  withScrollSyncLock("preview", () => {
    setEditorScrollRatio(ratio);
  });
}

async function login() {
  loginError.value = "";
  try {
    await auth.login(loginForm.value);
    await workspace.loadAdminWorkspace(auth.token!);
  } catch (error) {
    loginError.value = error instanceof Error ? error.message : "登录失败";
  }
}

async function saveCurrentDocument() {
  if (!auth.token) return;
  try {
    await workspace.saveActiveDocument(auth.token);
    statusMessage.value = "源码已保存";
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : "保存失败";
  }
}

async function normalizeMarkdown() {
  if (!auth.token) return;
  formatBusy.value = true;
  formatProgress.value = 8;
  formatStageLabel.value = "大模型处理中";
  statusMessage.value = "";
  try {
    await workspace.formatEditorTextWithAi(auth.token, (snapshot) => {
      formatProgress.value = snapshot.percent;
      formatStageLabel.value = snapshot.label;
    });
    formatProgress.value = 100;
    formatStageLabel.value = "导入完成";
    statusMessage.value = "已调用大模型完成格式化并导入新文档";
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : "大模型格式化失败";
  } finally {
    formatBusy.value = false;
    window.setTimeout(() => {
      if (!formatBusy.value) {
        formatProgress.value = 0;
        formatStageLabel.value = "";
      }
    }, 1000);
  }
}

function openSettings() {
  settingsForm.value = {
    title: branding.title,
    subtitle: branding.subtitle,
    footer: branding.footer,
    faviconHref: branding.faviconHref
  };
  showSettings.value = true;
}

function closeSettings() {
  showSettings.value = false;
  settingsBackdropPressed.value = false;
}

async function saveSettings() {
  settingsBusy.value = true;
  try {
    setBranding(settingsForm.value);
    statusMessage.value = "参数设置已保存";
    showSettings.value = false;
  } finally {
    settingsBusy.value = false;
  }
}

function handleSettingsBackdropPointerDown() {
  settingsBackdropPressed.value = true;
}

function handleSettingsBackdropPointerUp() {
  if (settingsBackdropPressed.value) {
    closeSettings();
  }
}

function cancelSettingsBackdropClose() {
  settingsBackdropPressed.value = false;
}

function restoreSettings() {
  resetBranding();
  settingsForm.value = {
    title: defaultBranding.title,
    subtitle: defaultBranding.subtitle,
    footer: defaultBranding.footer,
    faviconHref: defaultBranding.faviconHref
  };
  statusMessage.value = "已恢复默认参数";
}

async function handleFaviconChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("图标读取失败"));
    reader.readAsDataURL(file);
  });

  settingsForm.value.faviconHref = dataUrl;
  input.value = "";
}

async function deleteDocument(id: string, title: string) {
  if (!auth.token) return;
  const confirmed = window.confirm(`确认删除文档“${title}”吗？`);
  if (!confirmed) return;

  try {
    await api.deleteDocument(id, auth.token);
    await workspace.loadAdminWorkspace(auth.token);
    statusMessage.value = "文档已删除";
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : "删除失败";
  }
}

async function deleteSelectedDocuments() {
  if (!auth.token || selectedDocumentIds.value.length === 0) return;
  const docs = workspace.docs.filter((doc) => selectedDocumentIds.value.includes(doc.id));
  const confirmed = window.confirm(`确认删除已选择的 ${docs.length} 个文档吗？`);
  if (!confirmed) return;

  try {
    for (const doc of docs) {
      await api.deleteDocument(doc.id, auth.token);
    }
    await workspace.loadAdminWorkspace(auth.token);
    clearSelection();
    statusMessage.value = `已删除 ${docs.length} 个文档`;
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : "批量删除失败";
  }
}

async function moveDocumentToPath(doc: WorkspaceDoc, targetPath: string) {
  if (!auth.token) return;
  if (doc.archivePath === targetPath || (!doc.archivePath && targetPath === "未归档")) {
    return;
  }

  try {
    await workspace.moveDocument(auth.token, doc.id, targetPath);
    workspace.setSelectedFolder(targetPath);
    statusMessage.value = `已移动“${doc.title}”`;
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : "移动失败";
  }
}

watch(
  treeKeys,
  (keys) => {
    openFolders.value = Array.from(new Set([...openFolders.value.filter((item) => keys.includes(item)), ...keys]));
  },
  { immediate: true }
);

watch(
  () => workspace.docs.map((doc) => doc.id),
  (ids) => {
    selectedDocumentIds.value = selectedDocumentIds.value.filter((id) => ids.includes(id));
  },
  { immediate: true }
);

watch(
  () => workspace.activeId,
  async () => {
    await nextTick();
    setEditorScrollRatio(0);
    previewFrame.value?.setScrollRatio(0);
  }
);

onMounted(async () => {
  workspace.ensureInitialized();
  if (auth.token) {
    await workspace.loadAdminWorkspace(auth.token);
  }
});
</script>

<template>
  <section class="workspace-admin">
    <div v-if="!auth.isLoggedIn" class="login-shell">
      <div class="login-card">
        <p class="panel-eyebrow">管理员登录</p>
        <h2>进入后台工作区</h2>
        <label><span>用户名</span><input v-model="loginForm.username" /></label>
        <label><span>密码</span><input v-model="loginForm.password" type="password" /></label>
        <label><span>验证码</span><input v-model="loginForm.captcha" /></label>
        <button class="primary-btn" @click="login" :disabled="auth.loading">
          <FaIcon name="power-off" fixed-width />
          <span>登录</span>
        </button>
        <p v-if="loginError" class="error">{{ loginError }}</p>
      </div>
    </div>

    <section v-else class="workspace">
      <aside class="file-pane">
        <div class="pane-header">
          <div>
            <p class="pane-eyebrow">文件</p>
            <h2>后台工作区</h2>
          </div>
        </div>

        <label class="search-box">
          <FaIcon name="magnifying-glass" fixed-width class="search-icon" />
          <input v-model="search" type="text" placeholder="过滤文件..." />
        </label>

        <div class="pane-tools" :class="{ active: workspace.loading || selectedCount > 0 }">
          <div v-if="workspace.loading" class="status">同步中...</div>

          <div v-if="selectedCount > 0" class="tree-actions">
            <span>已选 {{ selectedCount }} 项</span>
            <div class="tree-action-buttons">
              <button type="button" class="subtle-btn" @click="deleteSelectedDocuments">
                <FaIcon name="trash-can" fixed-width />
                <span>批量删除</span>
              </button>
              <button type="button" class="subtle-btn" @click="clearSelection">
                <FaIcon name="xmark" fixed-width />
                <span>清空选择</span>
              </button>
            </div>
          </div>
        </div>

        <div class="folder-tree">
          <WorkspaceTree
            :nodes="workspace.tree"
            :active-id="workspace.activeId"
            :active-folder-path="workspace.selectedFolderPath"
            :search="search"
            :open-keys="openFolders"
            can-delete
            :selected-ids="selectedDocumentIds"
            @toggle="toggleFolder"
            @select-folder="workspace.setSelectedFolder($event)"
            @select="workspace.setActive($event.id)"
            @delete="deleteDocument($event.id, $event.title)"
            @toggle-select="toggleDocumentSelection"
            @move="moveDocumentToPath($event.doc, $event.targetPath)"
          />
        </div>
      </aside>

      <section class="editor-pane">
        <header class="editor-tabs">
          <div class="editor-topline">
            <button type="button" class="tab active">
              <FaIcon name="pen-to-square" fixed-width />
              <span>{{ workspace.activeDocument?.title || "未选择文档" }}</span>
            </button>
          </div>
        </header>

        <template v-if="workspace.activeDocument">
          <article class="editor-body">
            <div class="editor-fields">
              <label><span>标题</span><input v-model="workspace.editorTitle" /></label>
              <label
                ><span>归档路径</span><input v-model="workspace.editorArchivePath" placeholder="如 policy/national/2026"
              /></label>
            </div>

            <div class="editor-split">
              <section class="editor-panel">
                <div class="panel-title panel-title-row">
                  <div class="panel-title-main">
                    <FaIcon name="code" fixed-width />
                    <span>Markdown 源码</span>
                  </div>
                  <button type="button" class="subtle-btn convert-btn" :disabled="formatBusy" @click="normalizeMarkdown">
                    <FaIcon name="wand-magic-sparkles" fixed-width />
                    <span>{{ formatBusy ? "大模型处理中..." : "一键转换md格式" }}</span>
                  </button>
                </div>
                <label class="editor-field">
                  <textarea ref="markdownTextarea" v-model="workspace.editorMarkdown" @scroll="syncPreviewFromEditor"></textarea>
                </label>
              </section>

              <section class="preview-panel">
                <div class="panel-title">
                  <FaIcon name="eye" fixed-width />
                  <span>HTML 预览</span>
                </div>
                <div class="preview-surface">
                  <GovDocPreview ref="previewFrame" :source="workspace.editorMarkdown" @scroll-ratio="syncEditorFromPreview" />
                </div>
              </section>
            </div>
          </article>

          <footer class="editor-footer">
            <div v-if="formatProgress > 0" class="format-progress">
              <div class="format-progress-meta">
                <span>{{ formatStageLabel || "处理中" }}</span>
                <span>{{ formatProgress }}%</span>
              </div>
              <div class="format-progress-track">
                <div class="format-progress-fill" :style="{ width: `${formatProgress}%` }"></div>
              </div>
            </div>
            <p v-if="statusMessage" class="status">{{ statusMessage }}</p>
            <div class="action-row">
              <button class="save-btn secondary-btn" type="button" @click="openSettings">
                <FaIcon name="sliders" fixed-width />
                <span>参数设置</span>
              </button>
              <button class="save-btn" @click="saveCurrentDocument" :disabled="workspace.saving">
                <FaIcon name="floppy-disk" fixed-width />
                <span>{{ workspace.saving ? "保存中..." : "保存源码" }}</span>
              </button>
            </div>
          </footer>
        </template>

        <article v-else class="empty-state">
          <p>暂无文档，先通过顶部栏导入或新建一个文档。</p>
        </article>
      </section>
    </section>

    <div
      v-if="showSettings"
      class="settings-backdrop"
      @mousedown.self="handleSettingsBackdropPointerDown"
      @mouseup.self="handleSettingsBackdropPointerUp"
    >
      <section class="settings-dialog" @mousedown="cancelSettingsBackdropClose" @mouseup="cancelSettingsBackdropClose">
        <header class="settings-header">
          <div>
            <p class="panel-eyebrow">系统参数</p>
            <h3>界面与站点设置</h3>
          </div>
          <button type="button" class="icon-btn" @click="closeSettings">
            <FaIcon name="xmark" fixed-width />
          </button>
        </header>

        <div class="settings-form">
          <label><span>主标题</span><input v-model="settingsForm.title" /></label>
          <label><span>副标题</span><input v-model="settingsForm.subtitle" /></label>
          <label><span>页脚内容</span><input v-model="settingsForm.footer" /></label>
          <label><span>Favicon 路径</span><input v-model="settingsForm.faviconHref" placeholder="/favicon.ico 或 data:image/x-icon..." /></label>
          <label>
            <span>上传 favicon.ico</span>
            <input type="file" accept=".ico,image/x-icon,image/png,image/svg+xml" @change="handleFaviconChange" />
          </label>
        </div>

        <footer class="settings-actions">
          <button type="button" class="save-btn secondary-btn" @click="restoreSettings">恢复默认</button>
          <div class="settings-submit">
            <button type="button" class="save-btn secondary-btn" @click="closeSettings">取消</button>
            <button type="button" class="save-btn" :disabled="settingsBusy" @click="saveSettings">
              <FaIcon name="floppy-disk" fixed-width />
              <span>{{ settingsBusy ? "保存中..." : "保存设置" }}</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.workspace-admin {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.login-shell {
  height: 100%;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--app-bg);
  overflow: auto;
}

.login-card {
  width: min(420px, 100%);
  padding: 22px;
  display: grid;
  gap: 12px;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: var(--panel-bg);
}

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

.file-pane {
  border-right: 1px solid var(--border-color);
  background: linear-gradient(180deg, color-mix(in srgb, var(--panel-bg) 92%, #000 8%), var(--panel-bg));
  padding: 14px 12px;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 8px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  align-self: stretch;
}

.pane-header {
  display: flex;
  align-items: center;
  min-height: 30px;
}

.pane-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
}

.pane-eyebrow,
.panel-eyebrow,
.status,
.error,
.empty-state {
  color: var(--text-muted);
}

.pane-eyebrow,
.panel-eyebrow {
  margin: 0 0 2px;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

label {
  display: grid;
  gap: 6px;
}

input,
textarea {
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--panel-muted-bg);
  color: inherit;
  padding: 10px 12px;
  font: inherit;
}

textarea {
  min-height: 0;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  border: 0;
  border-radius: 8px;
  background: var(--panel-muted-bg);
  padding: 14px 16px 18px;
  resize: none;
  line-height: 1.7;
  overflow: auto;
}

.search-box {
  position: relative;
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
  width: 100%;
  box-sizing: border-box;
  min-height: 30px;
  border: 1px solid color-mix(in srgb, var(--input-border) 72%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--input-bg) 72%, var(--panel-header-bg) 28%);
  padding: 6px 10px 6px 30px;
  font-size: 12px;
  transition: border-color 120ms ease, background-color 120ms ease;
}

.search-box input:focus {
  outline: none;
  border-color: var(--nav-active-border);
  background: color-mix(in srgb, var(--input-bg) 84%, var(--panel-bg) 16%);
}

.folder-tree {
  display: block;
  overflow: auto;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  padding-top: 4px;
  padding-right: 2px;
}

.pane-tools {
  display: grid;
  gap: 4px;
  min-height: 0;
  overflow: hidden;
}

.pane-tools:not(.active) {
  height: 0;
  gap: 0;
}

.tree-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--text-muted);
  min-width: 0;
  min-height: 30px;
  padding: 0 1px;
}

.subtle-btn {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  border-radius: 6px;
  min-height: 28px;
  padding: 3px 6px;
  font: inherit;
  font-size: 11.5px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  white-space: nowrap;
}

.subtle-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.tree-action-buttons {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.editor-pane {
  background: var(--panel-muted-bg);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  align-self: stretch;
}

.editor-tabs {
  border-bottom: 1px solid var(--border-color);
  padding: 0 12px;
  display: flex;
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

.editor-body,
.empty-state {
  padding: 24px;
  flex: 1 1 auto;
  min-height: 0;
}

.editor-body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.editor-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  flex: 1 1 auto;
  min-height: 0;
}

.editor-panel,
.preview-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 12px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--panel-bg);
}

.editor-field {
  display: grid;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  border-radius: 8px;
  background: var(--panel-muted-bg);
  overflow: hidden;
}

.panel-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 18px;
  font-size: 12px;
  color: var(--text-muted);
}

.panel-title-row {
  justify-content: space-between;
}

.panel-title-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.convert-btn {
  min-height: 26px;
  padding: 3px 8px;
  font-size: 12px;
}

.preview-surface {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow: auto;
  border-radius: 8px;
  background: var(--panel-muted-bg);
  padding: 14px 16px 18px;
}

.editor-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 0 0 auto;
  padding: 12px 24px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--panel-header-bg);
}

.format-progress {
  display: grid;
  gap: 6px;
}

.format-progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.format-progress-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel-muted-bg) 70%, transparent);
  overflow: hidden;
}

.format-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2f6fed, #50b36a);
  transition: width 180ms ease;
}

.action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 32px;
  gap: 12px;
}

.primary-btn {
  border: 0;
  border-radius: 10px;
  min-height: 38px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #9b6829, #1f5a75);
  color: #fff8ef;
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.save-btn {
  border: 1px solid var(--nav-active-border);
  background: var(--nav-active-bg);
  color: var(--text-primary);
  border-radius: 6px;
  min-height: 32px;
  height: 32px;
  padding: 4px 10px;
  font: inherit;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  white-space: nowrap;
}

.save-btn:hover {
  background: var(--hover-bg);
}

.secondary-btn {
  border-color: transparent;
  background: transparent;
  color: var(--text-muted);
}

.secondary-btn:hover {
  color: var(--text-primary);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.settings-backdrop {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, #000 28%, transparent);
  display: grid;
  place-items: center;
  padding: 24px;
  z-index: 50;
}

.settings-dialog {
  width: min(640px, 100%);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--panel-bg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.16);
  display: grid;
  gap: 18px;
  padding: 18px 20px 20px;
}

.settings-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.settings-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.icon-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  min-height: 32px;
  min-width: 32px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.settings-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}

.settings-form label:last-child {
  grid-column: 1 / -1;
}

.settings-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-submit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.primary-btn :deep(i),
.save-btn :deep(i),
.icon-btn :deep(i),
.subtle-btn :deep(i),
.tab :deep(i),
.search-icon {
  width: 14px;
  min-width: 14px;
}

@media (max-width: 1024px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .tree-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .editor-fields,
  .editor-split {
    grid-template-columns: 1fr;
  }

  .settings-form {
    grid-template-columns: 1fr;
  }

  .editor-split {
    min-height: auto;
  }

  .settings-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-submit {
    justify-content: flex-end;
  }
}
</style>
