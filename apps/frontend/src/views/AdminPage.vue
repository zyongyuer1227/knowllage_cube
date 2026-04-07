<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import FaIcon from "../components/FaIcon.vue";
import GovDocPreview from "../components/GovDocPreview.vue";
import WorkspaceTree from "../components/WorkspaceTree.vue";
import { useAppSettings } from "../lib/app-settings";
import { api, type PreviewWatermarkSettings } from "../lib/api";
import { buildTaxonomyPaths } from "../lib/document-taxonomy";
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
const showAttributes = ref(false);
const showTaxonomySettings = ref(false);
const taxonomyBusy = ref(false);
const taxonomyBusinessPathsText = ref("");
const taxonomyLegalPathsText = ref("");
const settingsDialogPosition = ref({ x: 0, y: 0 });
const settingsDialogDragging = ref(false);
const settingsDialogDragStart = ref({ x: 0, y: 0, pointerX: 0, pointerY: 0 });
const defaultWatermarkSettings: PreviewWatermarkSettings = {
  enabled: true,
  mode: "both",
  text: "{{username}} {{timestamp}}\n{{documentTitle}}",
  color: "#8b949e",
  fontSize: 16,
  opacity: 0.16,
  rotate: -20,
  gapX: 240,
  gapY: 170
};

const settingsForm = ref({
  title: branding.title,
  subtitle: branding.subtitle,
  footer: branding.footer,
  faviconHref: branding.faviconHref,
  watermarkEnabled: defaultWatermarkSettings.enabled,
  watermarkMode: defaultWatermarkSettings.mode,
  watermarkText: defaultWatermarkSettings.text,
  watermarkColor: defaultWatermarkSettings.color,
  watermarkFontSize: defaultWatermarkSettings.fontSize,
  watermarkOpacity: defaultWatermarkSettings.opacity,
  watermarkRotate: defaultWatermarkSettings.rotate,
  watermarkGapX: defaultWatermarkSettings.gapX,
  watermarkGapY: defaultWatermarkSettings.gapY
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

const businessLevel1Options = computed(() => workspace.getBusinessPathOptions([], 0));
const businessLevel2Options = computed(() => workspace.getBusinessPathOptions(workspace.editorBusinessPath, 1));
const businessLevel3Options = computed(() => workspace.getBusinessPathOptions(workspace.editorBusinessPath, 2));
const legalLevel1Options = computed(() => workspace.getLegalPathOptions([], 0));
const legalLevel2Options = computed(() => workspace.getLegalPathOptions(workspace.editorLegalPath, 1));
const legalLevel3Options = computed(() => workspace.getLegalPathOptions(workspace.editorLegalPath, 2));

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

async function openSettings() {
  resetSettingsDialogPosition();
  settingsForm.value = {
    title: branding.title,
    subtitle: branding.subtitle,
    footer: branding.footer,
    faviconHref: branding.faviconHref,
    watermarkEnabled: defaultWatermarkSettings.enabled,
    watermarkMode: defaultWatermarkSettings.mode,
    watermarkText: defaultWatermarkSettings.text,
    watermarkColor: defaultWatermarkSettings.color,
    watermarkFontSize: defaultWatermarkSettings.fontSize,
    watermarkOpacity: defaultWatermarkSettings.opacity,
    watermarkRotate: defaultWatermarkSettings.rotate,
    watermarkGapX: defaultWatermarkSettings.gapX,
    watermarkGapY: defaultWatermarkSettings.gapY
  };
  if (auth.token) {
    try {
      const watermark = await api.getAdminPreviewWatermark(auth.token);
      settingsForm.value.watermarkEnabled = watermark.enabled;
      settingsForm.value.watermarkMode = watermark.mode;
      settingsForm.value.watermarkText = watermark.text;
      settingsForm.value.watermarkColor = watermark.color;
      settingsForm.value.watermarkFontSize = watermark.fontSize;
      settingsForm.value.watermarkOpacity = watermark.opacity;
      settingsForm.value.watermarkRotate = watermark.rotate;
      settingsForm.value.watermarkGapX = watermark.gapX;
      settingsForm.value.watermarkGapY = watermark.gapY;
    } catch (error) {
      statusMessage.value = error instanceof Error ? error.message : "读取水印设置失败";
    }
  }
  showSettings.value = true;
}

function openAttributes() {
  showAttributes.value = true;
}

function closeAttributes() {
  showAttributes.value = false;
}

function openTaxonomySettings() {
  taxonomyBusinessPathsText.value = buildTaxonomyPaths(workspace.documentTaxonomy.businessDomains).join("\n");
  taxonomyLegalPathsText.value = buildTaxonomyPaths(workspace.documentTaxonomy.legalLevels).join("\n");
  showTaxonomySettings.value = true;
}

function closeTaxonomySettings() {
  showTaxonomySettings.value = false;
}

function buildTaxonomyTreeFromPaths(text: string) {
  const root: Array<{ name: string; children: Array<any> }> = [];
  const lines = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const parts = line.split("/").map((item) => item.trim()).filter(Boolean).slice(0, 3);
    if (parts.length === 0) {
      return;
    }
    let nodes = root;
    parts.forEach((part) => {
      let node = nodes.find((item) => item.name === part);
      if (!node) {
        node = { name: part, children: [] };
        nodes.push(node);
      }
      nodes = node.children;
    });
  });

  return root;
}

async function saveTaxonomySettings() {
  if (!auth.token) return;
  taxonomyBusy.value = true;
  try {
    await workspace.saveDocumentTaxonomy(auth.token, {
      businessDomains: buildTaxonomyTreeFromPaths(taxonomyBusinessPathsText.value),
      legalLevels: buildTaxonomyTreeFromPaths(taxonomyLegalPathsText.value)
    });
    if (workspace.getBusinessPathOptions(workspace.editorBusinessPath, 0).length === 0) {
      workspace.editorBusinessPath = [];
    }
    if (workspace.getLegalPathOptions(workspace.editorLegalPath, 0).length === 0) {
      workspace.editorLegalPath = [];
    }
    statusMessage.value = "文档属性体系已更新";
    showTaxonomySettings.value = false;
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : "保存属性体系失败";
  } finally {
    taxonomyBusy.value = false;
  }
}

function closeSettings() {
  showSettings.value = false;
  settingsDialogDragging.value = false;
  settingsDialogPosition.value = { x: 0, y: 0 };
}

async function saveSettings() {
  if (!auth.token) return;
  settingsBusy.value = true;
  try {
    setBranding(settingsForm.value);
    await api.updateAdminPreviewWatermark(
      {
        enabled: settingsForm.value.watermarkEnabled,
        mode: settingsForm.value.watermarkMode,
        text: settingsForm.value.watermarkText,
        color: settingsForm.value.watermarkColor,
        fontSize: settingsForm.value.watermarkFontSize,
        opacity: settingsForm.value.watermarkOpacity,
        rotate: settingsForm.value.watermarkRotate,
        gapX: settingsForm.value.watermarkGapX,
        gapY: settingsForm.value.watermarkGapY
      },
      auth.token
    );
    await workspace.loadAdminWorkspace(auth.token);
    statusMessage.value = "参数设置已保存";
    showSettings.value = false;
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : "保存参数设置失败";
  } finally {
    settingsBusy.value = false;
  }
}

function stopSettingsDrag() {
  settingsDialogDragging.value = false;
}

function handleSettingsDragMove(event: PointerEvent) {
  if (!settingsDialogDragging.value) {
    return;
  }
  settingsDialogPosition.value = {
    x: settingsDialogDragStart.value.x + event.clientX - settingsDialogDragStart.value.pointerX,
    y: settingsDialogDragStart.value.y + event.clientY - settingsDialogDragStart.value.pointerY
  };
}

function startSettingsDrag(event: PointerEvent) {
  if (window.innerWidth <= 1024) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, input, label")) {
    return;
  }
  settingsDialogDragging.value = true;
  settingsDialogDragStart.value = {
    x: settingsDialogPosition.value.x,
    y: settingsDialogPosition.value.y,
    pointerX: event.clientX,
    pointerY: event.clientY
  };
}

function resetSettingsDialogPosition() {
  settingsDialogPosition.value = { x: 0, y: 0 };
}

function restoreSettings() {
  resetBranding();
  settingsForm.value = {
    title: defaultBranding.title,
    subtitle: defaultBranding.subtitle,
    footer: defaultBranding.footer,
    faviconHref: defaultBranding.faviconHref,
    watermarkEnabled: defaultWatermarkSettings.enabled,
    watermarkMode: defaultWatermarkSettings.mode,
    watermarkText: defaultWatermarkSettings.text,
    watermarkColor: defaultWatermarkSettings.color,
    watermarkFontSize: defaultWatermarkSettings.fontSize,
    watermarkOpacity: defaultWatermarkSettings.opacity,
    watermarkRotate: defaultWatermarkSettings.rotate,
    watermarkGapX: defaultWatermarkSettings.gapX,
    watermarkGapY: defaultWatermarkSettings.gapY
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
    closeAttributes();
  }
);

onMounted(async () => {
  workspace.ensureInitialized();
  window.addEventListener("pointermove", handleSettingsDragMove);
  window.addEventListener("pointerup", stopSettingsDrag);
  if (auth.token) {
    await workspace.loadAdminWorkspace(auth.token);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", handleSettingsDragMove);
  window.removeEventListener("pointerup", stopSettingsDrag);
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
                  <GovDocPreview
                    ref="previewFrame"
                    :source="workspace.editorMarkdown"
                    :persisted-html="workspace.activeDocument.previewHtml"
                    @scroll-ratio="syncEditorFromPreview"
                  />
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
              <div class="editor-actions">
                <button class="save-btn secondary-btn" type="button" @click="openTaxonomySettings">
                  <FaIcon name="sitemap" fixed-width />
                  <span>属性体系</span>
                </button>
                <button class="save-btn secondary-btn" type="button" @click="openAttributes">
                  <FaIcon name="tags" fixed-width />
                  <span>文档属性</span>
                </button>
                <button class="save-btn" @click="saveCurrentDocument" :disabled="workspace.saving">
                  <FaIcon name="floppy-disk" fixed-width />
                  <span>{{ workspace.saving ? "保存中..." : "保存源码" }}</span>
                </button>
              </div>
            </div>
          </footer>
        </template>

        <article v-else class="empty-state">
          <p>暂无文档，先通过顶部栏导入或新建一个文档。</p>
        </article>
      </section>
    </section>

    <div
      v-if="showAttributes"
      class="settings-backdrop"
      @mousedown.self="closeAttributes"
    >
      <section class="settings-dialog attribute-dialog">
        <header class="settings-header">
          <div>
            <p class="panel-eyebrow">文档属性</p>
            <h3>分类与效力定义</h3>
          </div>
          <button type="button" class="icon-btn" @click="closeAttributes">
            <FaIcon name="xmark" fixed-width />
          </button>
        </header>

        <div class="settings-form">
          <label>
            <span>业务领域一级</span>
            <select :value="workspace.editorBusinessPath[0] ?? ''" @change="workspace.setBusinessPathLevel(0, ($event.target as HTMLSelectElement).value)">
              <option value="">未设置</option>
              <option v-for="item in workspace.businessDomainOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>业务领域二级</span>
            <select :value="workspace.editorBusinessPath[1] ?? ''" :disabled="businessLevel2Options.length === 0" @change="workspace.setBusinessPathLevel(1, ($event.target as HTMLSelectElement).value)">
              <option value="">{{ businessLevel2Options.length === 0 ? "当前层级无可选项" : "未设置" }}</option>
              <option v-for="item in businessLevel2Options" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>业务领域三级</span>
            <select :value="workspace.editorBusinessPath[2] ?? ''" :disabled="businessLevel3Options.length === 0" @change="workspace.setBusinessPathLevel(2, ($event.target as HTMLSelectElement).value)">
              <option value="">{{ businessLevel3Options.length === 0 ? "当前层级无可选项" : "未设置" }}</option>
              <option v-for="item in businessLevel3Options" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>效力层级一级</span>
            <select :value="workspace.editorLegalPath[0] ?? ''" @change="workspace.setLegalPathLevel(0, ($event.target as HTMLSelectElement).value)">
              <option value="">未设置</option>
              <option v-for="item in workspace.legalLevelOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label>
            <span>效力层级二级</span>
            <select :value="workspace.editorLegalPath[1] ?? ''" :disabled="legalLevel2Options.length === 0" @change="workspace.setLegalPathLevel(1, ($event.target as HTMLSelectElement).value)">
              <option value="">{{ legalLevel2Options.length === 0 ? "当前层级无可选项" : "未设置" }}</option>
              <option v-for="item in legalLevel2Options" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <label class="attribute-wide">
            <span>效力层级三级</span>
            <select :value="workspace.editorLegalPath[2] ?? ''" :disabled="legalLevel3Options.length === 0" @change="workspace.setLegalPathLevel(2, ($event.target as HTMLSelectElement).value)">
              <option value="">{{ legalLevel3Options.length === 0 ? "当前层级无可选项" : "未设置" }}</option>
              <option v-for="item in legalLevel3Options" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
        </div>

        <footer class="settings-actions">
          <p class="attribute-summary">{{ workspace.editorBusinessPath.join(" / ") || "未设置业务领域" }}<br />{{ workspace.editorLegalPath.join(" / ") || "未设置效力层级" }}</p>
          <div class="settings-submit">
            <button type="button" class="save-btn secondary-btn" @click="closeAttributes">完成</button>
          </div>
        </footer>
      </section>
    </div>

    <div
      v-if="showTaxonomySettings"
      class="settings-backdrop"
      @mousedown.self="closeTaxonomySettings"
    >
      <section class="settings-dialog taxonomy-dialog">
        <header class="settings-header">
          <div>
            <p class="panel-eyebrow">属性体系</p>
            <h3>维护文档属性配置</h3>
          </div>
          <button type="button" class="icon-btn" @click="closeTaxonomySettings">
            <FaIcon name="xmark" fixed-width />
          </button>
        </header>

        <div class="taxonomy-grid">
          <section class="taxonomy-panel">
            <div class="taxonomy-header">
              <span>业务领域路径</span>
            </div>
            <label>
              <span>每行一个完整路径，最多三级，例如：`道路运输/道路旅客运输/班线客运`</span>
              <textarea v-model="taxonomyBusinessPathsText" rows="18" placeholder="如&#10;道路运输&#10;道路运输/道路旅客运输&#10;道路运输/道路旅客运输/班线客运"></textarea>
            </label>
          </section>

          <section class="taxonomy-panel">
            <div class="taxonomy-header">
              <span>效力层级路径</span>
            </div>
            <label>
              <span>每行一个完整路径，最多三级，例如：`法律/国家法律/综合`</span>
              <textarea v-model="taxonomyLegalPathsText" rows="18" placeholder="如&#10;法律&#10;行政法规&#10;行政法规/交通运输"></textarea>
            </label>
          </section>
        </div>

        <footer class="settings-actions">
          <p class="attribute-summary">管理员定义后，上传、新建和文档属性弹窗都会直接使用这里的配置。</p>
          <div class="settings-submit">
            <button type="button" class="save-btn secondary-btn" @click="closeTaxonomySettings">取消</button>
            <button type="button" class="save-btn" :disabled="taxonomyBusy" @click="saveTaxonomySettings">
              <FaIcon name="floppy-disk" fixed-width />
              <span>{{ taxonomyBusy ? "保存中..." : "保存属性体系" }}</span>
            </button>
          </div>
        </footer>
      </section>
    </div>

    <div
      v-if="showSettings"
      class="settings-backdrop"
      @click.self="closeSettings"
    >
      <section
        class="settings-dialog settings-dialog-elevated"
        :class="{ dragging: settingsDialogDragging }"
        :style="{ transform: `translate(${settingsDialogPosition.x}px, ${settingsDialogPosition.y}px)` }"
      >
        <header class="settings-header settings-drag-handle" @pointerdown="startSettingsDrag">
          <div class="settings-header-copy">
            <p class="panel-eyebrow">系统参数</p>
            <h3>界面与站点设置</h3>
            <p class="settings-header-desc">参考政企后台配置界面，分区设置、即时保存，支持拖动弹窗。</p>
          </div>
          <div class="settings-header-tools">
            <button type="button" class="drag-chip" @click="resetSettingsDialogPosition">
              <FaIcon name="arrows-up-down-left-right" fixed-width />
              <span>归位</span>
            </button>
            <button type="button" class="icon-btn" @click="closeSettings">
              <FaIcon name="xmark" fixed-width />
            </button>
          </div>
        </header>

        <div class="settings-scroll">
          <div class="settings-layout settings-layout-polished">
            <section class="settings-hero">
              <div>
                <p class="panel-eyebrow">配置概览</p>
                <strong>预览水印与界面标识</strong>
                <span>优先保证可读性和后台管理效率，字段字号已收窄，避免视觉膨胀。</span>
              </div>
              <div class="settings-hero-metrics">
                <div class="metric-card">
                  <span>水印状态</span>
                  <strong>{{ settingsForm.watermarkEnabled ? "已启用" : "未启用" }}</strong>
                </div>
                <div class="metric-card">
                  <span>当前字号</span>
                  <strong>{{ settingsForm.watermarkFontSize }} px</strong>
                </div>
              </div>
            </section>

            <div class="settings-columns">
              <section class="settings-block settings-block-primary">
                <div class="settings-block-head">
                  <strong>界面标识</strong>
                  <span>用于浏览器标题、页脚和站点图标。这里保持轻量，不做夸张展示。</span>
                </div>
                <div class="settings-form settings-form-compact">
                  <label><span>主标题</span><input v-model="settingsForm.title" /></label>
                  <label><span>副标题</span><input v-model="settingsForm.subtitle" /></label>
                  <label class="settings-wide"><span>页脚内容</span><input v-model="settingsForm.footer" /></label>
                  <label class="settings-wide"><span>Favicon 路径</span><input v-model="settingsForm.faviconHref" placeholder="/favicon.ico 或 data:image/x-icon..." /></label>
                  <label class="settings-wide">
                    <span>上传 favicon.ico</span>
                    <input type="file" accept=".ico,image/x-icon,image/png,image/svg+xml" @change="handleFaviconChange" />
                  </label>
                </div>
              </section>

              <section class="settings-block settings-block-primary">
                <div class="settings-block-head">
                  <strong>HTML 水印</strong>
                  <span>作用于欢迎页和文档预览。参数范围收紧为常用值，避免字体过大或画面过满。</span>
                </div>
                <div class="settings-form settings-form-compact">
                  <label class="toggle-field settings-wide">
                    <span>启用水印</span>
                    <input v-model="settingsForm.watermarkEnabled" type="checkbox" />
                  </label>
                  <label>
                    <span>作用范围</span>
                    <select v-model="settingsForm.watermarkMode">
                      <option value="both">浏览与导出</option>
                      <option value="view">仅浏览</option>
                      <option value="export">仅导出</option>
                    </select>
                  </label>
                  <label class="settings-wide">
                    <span>动态模板</span>
                    <textarea
                      v-model="settingsForm.watermarkText"
                      rows="4"
                      placeholder="如：{{username}} {{timestamp}}&#10;{{documentTitle}}&#10;{{ip}}"
                    ></textarea>
                  </label>
                  <label class="settings-wide">
                    <span v-pre>可用变量：{{username}}、{{timestamp}}、{{documentTitle}}、{{documentId}}、{{ip}}、{{archivePath}}</span>
                  </label>
                  <label>
                    <span>水印颜色</span>
                    <div class="color-field">
                      <input v-model="settingsForm.watermarkColor" type="color" />
                      <input v-model="settingsForm.watermarkColor" placeholder="#8b949e" />
                    </div>
                  </label>
                  <label>
                    <span>字号</span>
                    <input v-model.number="settingsForm.watermarkFontSize" type="number" min="12" max="36" />
                  </label>
                  <label>
                    <span>透明度</span>
                    <input v-model.number="settingsForm.watermarkOpacity" type="number" min="0.05" max="0.4" step="0.01" />
                  </label>
                  <label>
                    <span>旋转角度</span>
                    <input v-model.number="settingsForm.watermarkRotate" type="number" min="-45" max="45" />
                  </label>
                  <label>
                    <span>横向间距</span>
                    <input v-model.number="settingsForm.watermarkGapX" type="number" min="120" max="360" step="10" />
                  </label>
                  <label>
                    <span>纵向间距</span>
                    <input v-model.number="settingsForm.watermarkGapY" type="number" min="100" max="300" step="10" />
                  </label>
                </div>
              </section>
            </div>
          </div>
        </div>

        <footer class="settings-actions settings-actions-sticky">
          <div class="settings-actions-meta">
            <span>保存后当前欢迎页与文档 HTML 预览立即刷新。</span>
          </div>
          <div class="settings-submit">
            <button type="button" class="save-btn secondary-btn" @click="restoreSettings">恢复默认</button>
            <button type="button" class="save-btn secondary-btn" @click="closeSettings">取消</button>
            <button type="button" class="save-btn primary-strong-btn" :disabled="settingsBusy" @click="saveSettings">
              <FaIcon name="floppy-disk" fixed-width />
              <span>{{ settingsBusy ? "保存中..." : "确定并保存" }}</span>
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
select,
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

.editor-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
  background: color-mix(in srgb, #06111d 34%, transparent);
  display: grid;
  place-items: center;
  padding: 24px;
  z-index: 50;
  backdrop-filter: blur(10px);
}

.settings-dialog {
  width: min(940px, 100%);
  max-height: min(82vh, 920px);
  border: 1px solid color-mix(in srgb, var(--border-color) 82%, #fff 8%);
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel-header-bg) 88%, #fff 4%), color-mix(in srgb, var(--panel-bg) 98%, #fff 2%));
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.24);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0;
  overflow: hidden;
  transition: box-shadow 0.16s ease;
}

.settings-dialog.dragging {
  box-shadow: 0 34px 90px rgba(0, 0, 0, 0.3);
}

.settings-dialog-elevated {
  will-change: transform;
}

.settings-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 78%, transparent);
  background: color-mix(in srgb, var(--panel-header-bg) 90%, #fff 4%);
}

.settings-drag-handle {
  cursor: move;
  user-select: none;
}

.settings-header-copy {
  display: grid;
  gap: 4px;
}

.settings-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.settings-header-desc {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.settings-header-tools {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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

.drag-chip {
  border: 1px solid var(--input-border);
  background: color-mix(in srgb, var(--panel-muted-bg) 88%, #fff 6%);
  color: var(--text-secondary);
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.drag-chip:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
}

.settings-scroll {
  overflow: auto;
  padding: 18px;
  min-height: 0;
}

.settings-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}

.settings-form span {
  font-size: 12px;
  color: var(--text-secondary);
}

.settings-form-compact input {
  min-height: 38px;
  padding: 8px 10px;
  font-size: 13px;
}

.settings-form-compact select {
  min-height: 38px;
  padding: 8px 10px;
  font-size: 13px;
}

.settings-form-compact textarea {
  min-height: 104px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--panel-muted-bg);
  padding: 10px 12px;
  line-height: 1.55;
  font-size: 13px;
}

.settings-layout {
  display: grid;
  gap: 16px;
}

.settings-layout-polished {
  gap: 18px;
}

.settings-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid color-mix(in srgb, var(--border-color) 78%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--panel-header-bg) 88%, #456 12%), color-mix(in srgb, var(--panel-muted-bg) 94%, #fff 4%));
}

.settings-hero strong {
  display: block;
  margin-top: 4px;
  font-size: 18px;
  line-height: 1.3;
}

.settings-hero span {
  display: block;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.settings-hero-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 12px;
}

.metric-card {
  display: grid;
  align-content: center;
  gap: 6px;
  min-width: 120px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--border-color) 76%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-bg) 84%, #fff 8%);
}

.metric-card span {
  color: var(--text-muted);
  font-size: 11px;
}

.metric-card strong {
  font-size: 15px;
  line-height: 1.25;
}

.settings-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.settings-block {
  display: grid;
  gap: 14px;
  padding: 16px 16px 18px;
  border: 1px solid color-mix(in srgb, var(--border-color) 78%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel-muted-bg) 94%, #fff 4%);
}

.settings-block-primary {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.settings-block-head {
  display: grid;
  gap: 4px;
}

.settings-block-head strong {
  font-size: 15px;
  font-weight: 600;
}

.settings-block-head span {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.settings-wide {
  grid-column: 1 / -1;
}

.toggle-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle-field input {
  width: 18px;
  height: 18px;
  padding: 0;
}

.color-field {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.color-field input[type="color"] {
  min-height: 38px;
  padding: 4px;
}

.attribute-dialog {
  width: min(560px, 100%);
}

.taxonomy-dialog {
  width: min(980px, 100%);
}

.attribute-wide {
  grid-column: 1 / -1;
}

.attribute-summary {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.taxonomy-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.9fr);
  gap: 18px;
}

.taxonomy-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.taxonomy-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-muted);
  font-size: 12px;
}

.taxonomy-domain-list {
  display: grid;
  gap: 12px;
  max-height: 52vh;
  overflow: auto;
  padding-right: 4px;
}

.taxonomy-domain-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--panel-muted-bg);
}

.taxonomy-domain-card textarea,
.taxonomy-panel textarea {
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
  resize: vertical;
}

.taxonomy-remove {
  justify-self: flex-start;
}

.settings-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-actions-sticky {
  min-height: 68px;
  padding: 14px 18px 16px;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 78%, transparent);
  background: color-mix(in srgb, var(--panel-header-bg) 90%, #fff 4%);
  position: relative;
  z-index: 1;
}

.settings-actions-meta {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.settings-submit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.primary-strong-btn {
  background: var(--accent-bg);
  border-color: var(--accent-bg);
  color: var(--accent-text);
}

.primary-strong-btn:hover {
  filter: brightness(1.04);
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

  .settings-dialog {
    width: min(100%, 860px);
    max-height: calc(100dvh - 20px);
    transform: none !important;
  }

  .settings-drag-handle {
    cursor: default;
  }

  .settings-scroll,
  .settings-actions-sticky,
  .settings-header {
    padding-left: 14px;
    padding-right: 14px;
  }

  .settings-hero,
  .settings-columns {
    grid-template-columns: 1fr;
  }

  .settings-hero {
    flex-direction: column;
  }

  .taxonomy-grid {
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
