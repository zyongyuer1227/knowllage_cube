<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useRoute } from "vue-router";
import FaIcon from "./components/FaIcon.vue";
import { useAppSettings, type ThemeMode } from "./lib/app-settings";
import { useAuthStore } from "./stores/auth";
import { useWorkspaceStore } from "./stores/workspace";

const { branding, effectiveTheme, setTheme, themeMode } = useAppSettings();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const workspace = useWorkspaceStore();
const importInput = ref<HTMLInputElement | null>(null);
const actionMode = ref<"" | "document" | "folder">("");
const actionInput = ref("");
const actionStatus = ref("");
const actionError = ref("");
const actionBusy = ref(false);
const actionProgress = ref(0);
const actionProgressLabel = ref("");
let progressTimer: number | null = null;

const showAdminActions = computed(() => route.path === "/admin" && auth.isLoggedIn);
const bannerVisible = computed(() => actionBusy.value || !!actionError.value || !!actionStatus.value);
const actionPlaceholder = computed(() =>
  actionMode.value === "folder" ? "输入完整文件夹路径，如 法律法规/国家/行政法规" : "输入新文档标题"
);
const homeLinkTarget = computed(() => (auth.isLoggedIn ? "/admin" : "/"));
const homeLinkLabel = computed(() => (auth.isLoggedIn ? "管理员" : "游客"));

function stopProgress() {
  if (progressTimer !== null) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
}

function startProgress(label: string) {
  stopProgress();
  actionProgress.value = 8;
  actionProgressLabel.value = label;
  progressTimer = window.setInterval(() => {
    if (actionProgress.value < 72) {
      actionProgress.value += 6;
      return;
    }
    if (actionProgress.value < 90) {
      actionProgress.value += 1;
    }
  }, 700);
}

function finishProgress(label: string) {
  actionProgressLabel.value = label;
  actionProgress.value = 100;
  stopProgress();
}

function setProgress(value: number, label: string) {
  stopProgress();
  actionProgress.value = Math.max(0, Math.min(100, value));
  actionProgressLabel.value = label;
}

function resetProgress() {
  stopProgress();
  actionProgress.value = 0;
  actionProgressLabel.value = "";
}

function handleLogout() {
  auth.logout();
  actionMode.value = "";
  actionInput.value = "";
  actionStatus.value = "";
  actionError.value = "";
  router.push("/");
}

function openAction(mode: "document" | "folder") {
  actionMode.value = mode;
  actionError.value = "";
  actionStatus.value = "";
  actionInput.value = mode === "folder" ? workspace.editorArchivePath.trim() : "";
}

function closeAction() {
  actionMode.value = "";
  actionInput.value = "";
}

async function handleImport(event: Event) {
  if (!auth.token) return;
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length === 0) return;

  actionBusy.value = true;
  actionError.value = "";
  actionStatus.value = "";
  const hasWord = files.some((file) => /\.(docx?|DOCX?)$/.test(file.name));
  startProgress(hasWord ? "正在上传文档..." : "正在上传文档...");
  try {
    const result = await workspace.importFiles(auth.token, files);
    const tasks = result?.tasks ?? [];

    if (tasks.length > 0) {
      setProgress(
        12,
        hasWord ? `上传完成，正在后台转换：${tasks[0]?.fileName ?? "文档"}` : "上传完成，正在处理文档..."
      );
      const finalResult = await workspace.waitForImportTasks(auth.token, tasks, (snapshot) => {
        const ratio = snapshot.total === 0 ? 0 : (snapshot.completed + snapshot.failed) / snapshot.total;
        const percent = Math.round(12 + ratio * 88);
        const label =
          snapshot.completed + snapshot.failed >= snapshot.total
            ? "后台转换已完成"
            : `正在转换（${snapshot.completed + snapshot.failed}/${snapshot.total}）：${snapshot.activeFileName || "文档"}`;
        setProgress(percent, label);
      });

      if (finalResult.failed.length > 0) {
        const firstFailed = finalResult.failed[0];
        throw new Error(firstFailed.errorMessage || `部分文件转换失败：${firstFailed.fileName}`);
      }
    }

    finishProgress("导入完成");
    actionStatus.value = `已导入 ${files.length} 个文件`;
  } catch (error) {
    resetProgress();
    actionError.value = error instanceof Error ? error.message : "导入失败";
  } finally {
    resetProgress();
    actionBusy.value = false;
    input.value = "";
  }
}

async function submitAction() {
  if (!auth.token || !actionMode.value) return;
  const value = actionInput.value.trim();
  if (!value) {
    actionError.value = actionMode.value === "folder" ? "请输入文件夹路径" : "请输入文档标题";
    return;
  }

  actionBusy.value = true;
  actionError.value = "";
  actionStatus.value = "";
  startProgress(actionMode.value === "document" ? "正在创建文档..." : "正在创建文件夹...");
  try {
    if (actionMode.value === "document") {
      await workspace.createDocument(auth.token, value);
      closeAction();
      finishProgress("新文档已创建");
      actionStatus.value = "新文档已创建";
    } else {
      await workspace.createFolder(auth.token, value);
      closeAction();
      finishProgress("新文件夹已创建");
      actionStatus.value = "新文件夹已创建";
    }
  } catch (error) {
    resetProgress();
    actionError.value = error instanceof Error ? error.message : "操作失败";
  } finally {
    resetProgress();
    actionBusy.value = false;
  }
}
</script>

<template>
  <div
    class="shell"
    :class="`theme-${effectiveTheme}`"
    :style="{ '--chrome-offset': `${78 + (bannerVisible ? 32 : 0)}px` }"
  >
    <header class="topbar">
      <div class="brand">
        <strong>{{ branding.title }}</strong>
        <span>{{ branding.subtitle }}</span>
      </div>

      <div class="toolbar">
        <div class="topbar-tools">
          <div v-if="showAdminActions" class="admin-actions">
            <button class="topbar-btn" type="button" :disabled="actionBusy" @click="importInput?.click()">
              <FaIcon name="upload" fixed-width />
              <span>导入文档</span>
            </button>
            <button class="topbar-btn" type="button" :disabled="actionBusy" @click="openAction('document')">
              <FaIcon name="file-circle-plus" fixed-width />
              <span>新增文档</span>
            </button>
            <button class="topbar-btn" type="button" :disabled="actionBusy" @click="openAction('folder')">
              <FaIcon name="folder-plus" fixed-width />
              <span>新增文件夹</span>
            </button>
            <input
              ref="importInput"
              type="file"
              class="hidden-input"
              multiple
              accept=".html,.htm,.txt,.doc,.docx,.pdf"
              @change="handleImport"
            />
          </div>

          <form v-if="showAdminActions && actionMode" class="inline-action" @submit.prevent="submitAction">
            <FaIcon :name="actionMode === 'folder' ? 'folder-plus' : 'file-circle-plus'" fixed-width />
            <input v-model="actionInput" :placeholder="actionPlaceholder" />
            <button class="topbar-btn compact-btn" type="submit" :disabled="actionBusy">
              <span>{{ actionBusy ? "处理中" : "确定" }}</span>
            </button>
            <button class="topbar-btn compact-btn" type="button" :disabled="actionBusy" @click="closeAction">
              <span>取消</span>
            </button>
          </form>

          <label class="theme-switcher">
            <FaIcon name="palette" fixed-width />
            <span>主题</span>
            <select :value="themeMode" @change="setTheme(($event.target as HTMLSelectElement).value as ThemeMode)">
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="system">跟随系统</option>
            </select>
          </label>
        </div>

        <nav>
          <RouterLink :to="homeLinkTarget">
            <FaIcon name="desktop" fixed-width />
            <span>{{ homeLinkLabel }}</span>
          </RouterLink>
          <button v-if="auth.isLoggedIn" type="button" class="nav-link-btn" @click="handleLogout">
            <FaIcon name="right-from-bracket" fixed-width />
            <span>退出</span>
          </button>
          <RouterLink v-else to="/admin">
            <FaIcon name="gear" fixed-width />
            <span>登录</span>
          </RouterLink>
        </nav>
      </div>
    </header>

    <div v-if="actionBusy || actionError || actionStatus" class="action-banner" :class="{ error: !!actionError, busy: actionBusy }">
      <div class="banner-main">
        <FaIcon :name="actionError ? 'triangle-exclamation' : actionBusy ? 'spinner' : 'circle-check'" fixed-width />
        <span>{{ actionError || actionStatus || actionProgressLabel }}</span>
      </div>
      <div v-if="actionBusy" class="progress-track" aria-hidden="true">
        <div class="progress-fill" :style="{ width: `${actionProgress}%` }"></div>
      </div>
    </div>

    <main class="app-content">
      <RouterView v-slot="{ Component }">
        <section class="route-page">
          <component :is="Component" class="route-screen" />
        </section>
      </RouterView>
    </main>

    <footer class="app-footer">
      <span>{{ branding.footer }}</span>
    </footer>
  </div>
</template>

<style scoped>
.shell {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  overflow: hidden;
  background: var(--app-bg);
  color: var(--text-primary);
  --app-bg: #16181c;
  --topbar-bg: #181a1d;
  --border-color: #2a2d33;
  --panel-bg: #202226;
  --panel-muted-bg: #23262b;
  --panel-header-bg: #1e2024;
  --text-primary: #d7dae0;
  --text-secondary: #b8c0cc;
  --text-muted: #8f97a3;
  --button-bg: #272b31;
  --button-border: #343840;
  --button-text: #d7dae0;
  --input-bg: #17191c;
  --input-border: #30343b;
  --hover-bg: #2a2e35;
  --active-bg: #313844;
  --nav-active-bg: #2b2f36;
  --nav-active-border: #3a4049;
  --tab-bg: #2a2e35;
  --accent-bg: #7c8cff;
  --accent-text: #111318;
  --file-icon-bg: #2f3440;
  --file-icon-text: #9fb0ff;
}

.app-content {
  height: calc(100dvh - var(--chrome-offset));
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.route-page {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.route-screen {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.route-page :deep(.workspace-admin),
.route-page :deep(.workspace) {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
}

.theme-light {
  --app-bg: #f4f5f7;
  --topbar-bg: #ffffff;
  --border-color: #d9dde5;
  --panel-bg: #eef1f5;
  --panel-muted-bg: #ffffff;
  --panel-header-bg: #f7f9fc;
  --text-primary: #1f2329;
  --text-secondary: #3b4652;
  --text-muted: #697586;
  --button-bg: #ffffff;
  --button-border: #cfd6df;
  --button-text: #26313b;
  --input-bg: #ffffff;
  --input-border: #cfd6df;
  --hover-bg: #e6ebf2;
  --active-bg: #dbe6ff;
  --nav-active-bg: #eceff3;
  --nav-active-border: #d4dae2;
  --tab-bg: #e8edf5;
  --accent-bg: #5d78ff;
  --accent-text: #ffffff;
  --file-icon-bg: #dfe6f6;
  --file-icon-text: #3753da;
}

.topbar {
  height: 50px;
  border-bottom: 1px solid var(--border-color);
  background: var(--topbar-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  gap: 16px;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: 0 0 auto;
}

.brand strong {
  font-size: 14px;
  font-weight: 600;
}

.brand span {
  font-size: 12px;
  color: var(--text-muted);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  justify-content: flex-end;
}

.topbar-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.admin-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.topbar-btn,
.theme-switcher select,
.inline-action input {
  min-height: 32px;
}

.topbar-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  border-radius: 6px;
  padding: 4px 8px;
  font: inherit;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.topbar-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.topbar-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.inline-action {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 12px;
}

.inline-action input {
  width: 280px;
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
}

.compact-btn {
  padding-left: 6px;
  padding-right: 6px;
}

.theme-switcher {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.theme-switcher :deep(i),
a :deep(i),
.topbar-btn :deep(i) {
  width: 14px;
  min-width: 14px;
}

.theme-switcher select {
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
}

nav {
  display: flex;
  gap: 8px;
}

a,
.nav-link-btn {
  color: var(--text-secondary);
  font-size: 13px;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

a {
  text-decoration: none;
}

a:hover,
.nav-link-btn:hover {
  background: var(--hover-bg);
}

a.router-link-active {
  background: var(--nav-active-bg);
  border-color: var(--nav-active-border);
  color: var(--text-primary);
}

.nav-link-btn {
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.hidden-input {
  display: none;
}

.action-banner {
  min-height: 32px;
  padding: 6px 16px 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--panel-header-bg);
  color: var(--text-secondary);
  display: grid;
  gap: 6px;
  font-size: 12px;
}

.action-banner.error {
  color: #d06a6a;
}

.banner-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 18px;
}

.action-banner.busy :deep(.fa-spinner) {
  animation: spin 1s linear infinite;
}

.progress-track {
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--button-border) 55%, transparent);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5d78ff, #78b2ff);
  transition: width 240ms ease;
}

.app-footer {
  min-height: 28px;
  border-top: 1px solid var(--border-color);
  background: var(--topbar-bg);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1000px) {
  .topbar {
    height: auto;
    padding: 10px 12px;
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar {
    flex-wrap: wrap;
    justify-content: space-between;
  }

  .topbar-tools {
    flex-wrap: wrap;
  }

  .admin-actions {
    flex-wrap: wrap;
  }

  .inline-action {
    width: 100%;
  }

  .inline-action input {
    width: min(100%, 320px);
    flex: 1;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
