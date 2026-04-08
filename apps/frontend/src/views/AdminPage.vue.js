import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import FaIcon from "../components/FaIcon.vue";
import AdminDocPreview from "../components/AdminDocPreview.vue";
import { useAppSettings } from "../lib/app-settings";
import { api } from "../lib/api";
import { buildTaxonomyPaths } from "../lib/document-taxonomy";
import { useAuthStore } from "../stores/auth";
import { useWorkspaceStore } from "../stores/workspace";
const auth = useAuthStore();
const workspace = useWorkspaceStore();
const { branding, defaultBranding, resetBranding, setBranding } = useAppSettings();
const search = ref("");
const loginError = ref("");
const statusMessage = ref("");
const selectedDocumentIds = ref([]);
const showSettings = ref(false);
const settingsBusy = ref(false);
const formatBusy = ref(false);
const formatProgress = ref(0);
const formatStageLabel = ref("");
const markdownTextarea = ref(null);
const previewFrame = ref(null);
const syncSource = ref(null);
const showAttributes = ref(false);
const showTaxonomySettings = ref(false);
const taxonomyBusy = ref(false);
const taxonomyBusinessPathsText = ref("");
const taxonomyLegalPathsText = ref("");
const activeBusinessPath = ref([]);
const activeLegalLevel = ref("");
const settingsDialogPosition = ref({ x: 0, y: 0 });
const settingsDialogDragging = ref(false);
const settingsDialogDragStart = ref({ x: 0, y: 0, pointerX: 0, pointerY: 0 });
const defaultWatermarkSettings = {
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
const businessLevel1Options = computed(() => workspace.getBusinessPathOptions([], 0));
const businessLevel2Options = computed(() => workspace.getBusinessPathOptions(workspace.editorBusinessPath, 1));
const businessLevel3Options = computed(() => workspace.getBusinessPathOptions(workspace.editorBusinessPath, 2));
const legalLevel1Options = computed(() => workspace.getLegalPathOptions([], 0));
const legalLevel2Options = computed(() => workspace.getLegalPathOptions(workspace.editorLegalPath, 1));
const legalLevel3Options = computed(() => workspace.getLegalPathOptions(workspace.editorLegalPath, 2));
const legalTabs = computed(() => workspace.documentTaxonomy.legalLevels.map((item) => item.name));
const businessRoots = computed(() => workspace.documentTaxonomy.businessDomains);
const filteredDocs = computed(() => {
    const keyword = search.value.trim().toLowerCase();
    return workspace.docs.filter((doc) => {
        const matchesLegal = !activeLegalLevel.value || doc.legalPath[0] === activeLegalLevel.value;
        const matchesBusiness = activeBusinessPath.value.length === 0 ||
            activeBusinessPath.value.every((segment, index) => doc.businessPath[index] === segment);
        const matchesKeyword = !keyword ||
            doc.title.toLowerCase().includes(keyword) ||
            doc.businessPath.join("/").toLowerCase().includes(keyword) ||
            doc.legalPath.join("/").toLowerCase().includes(keyword);
        return matchesLegal && matchesBusiness && matchesKeyword;
    });
});
const selectedCount = computed(() => selectedDocumentIds.value.length);
const activeBusinessSummary = computed(() => activeBusinessPath.value.join(" / ") || "全部业务领域");
const activeLegalSummary = computed(() => activeLegalLevel.value || "全部效力层级");
function toggleDocumentSelection(doc) {
    if (selectedDocumentIds.value.includes(doc.id)) {
        selectedDocumentIds.value = selectedDocumentIds.value.filter((id) => id !== doc.id);
        return;
    }
    selectedDocumentIds.value = [...selectedDocumentIds.value, doc.id];
}
function clearSelection() {
    selectedDocumentIds.value = [];
}
function setLegalLevel(level) {
    activeLegalLevel.value = level;
}
function selectBusinessPath(path) {
    activeBusinessPath.value = path;
}
function clearBusinessPath() {
    activeBusinessPath.value = [];
}
function countDocsForLegal(level) {
    return workspace.docs.filter((doc) => {
        const matchesLegal = doc.legalPath[0] === level;
        const matchesBusiness = activeBusinessPath.value.length === 0 ||
            activeBusinessPath.value.every((segment, index) => doc.businessPath[index] === segment);
        return matchesLegal && matchesBusiness;
    }).length;
}
function countDocsForBusiness(path) {
    return workspace.docs.filter((doc) => {
        const matchesPath = path.every((segment, index) => doc.businessPath[index] === segment);
        const matchesLegal = !activeLegalLevel.value || doc.legalPath[0] === activeLegalLevel.value;
        return matchesPath && matchesLegal;
    }).length;
}
function countDocsForAllLegal() {
    return workspace.docs.filter((doc) => {
        return activeBusinessPath.value.length === 0 ||
            activeBusinessPath.value.every((segment, index) => doc.businessPath[index] === segment);
    }).length;
}
function countDocsForAllBusiness() {
    return workspace.docs.filter((doc) => {
        return !activeLegalLevel.value || doc.legalPath[0] === activeLegalLevel.value;
    }).length;
}
function isBusinessPathActive(path) {
    return path.length === activeBusinessPath.value.length && path.every((segment, index) => activeBusinessPath.value[index] === segment);
}
function withScrollSyncLock(source, callback) {
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
    if (!textarea)
        return 0;
    const maxScrollTop = textarea.scrollHeight - textarea.clientHeight;
    if (maxScrollTop <= 0)
        return 0;
    return textarea.scrollTop / maxScrollTop;
}
function setEditorScrollRatio(value) {
    const textarea = markdownTextarea.value;
    if (!textarea)
        return;
    const ratio = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    const maxScrollTop = textarea.scrollHeight - textarea.clientHeight;
    textarea.scrollTop = maxScrollTop > 0 ? maxScrollTop * ratio : 0;
}
function syncPreviewFromEditor() {
    if (syncSource.value === "preview")
        return;
    withScrollSyncLock("editor", () => {
        previewFrame.value?.setScrollRatio(getEditorScrollRatio());
    });
}
function syncEditorFromPreview(ratio) {
    if (syncSource.value === "editor")
        return;
    withScrollSyncLock("preview", () => {
        setEditorScrollRatio(ratio);
    });
}
async function login() {
    loginError.value = "";
    try {
        await auth.login(loginForm.value);
        await workspace.loadAdminWorkspace(auth.token);
    }
    catch (error) {
        loginError.value = error instanceof Error ? error.message : "登录失败";
    }
}
async function saveCurrentDocument() {
    if (!auth.token || workspace.activeDocumentLoading)
        return;
    try {
        await workspace.saveActiveDocument(auth.token);
        statusMessage.value = "源码已保存";
    }
    catch (error) {
        statusMessage.value = error instanceof Error ? error.message : "保存失败";
    }
}
async function saveDocumentAttributes() {
    await saveCurrentDocument();
    closeAttributes();
}
async function normalizeMarkdown() {
    if (!auth.token || workspace.activeDocumentLoading)
        return;
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
    }
    catch (error) {
        statusMessage.value = error instanceof Error ? error.message : "大模型格式化失败";
    }
    finally {
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
        }
        catch (error) {
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
function buildTaxonomyTreeFromPaths(text) {
    const root = [];
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
    if (!auth.token)
        return;
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
    }
    catch (error) {
        statusMessage.value = error instanceof Error ? error.message : "保存属性体系失败";
    }
    finally {
        taxonomyBusy.value = false;
    }
}
function closeSettings() {
    showSettings.value = false;
    settingsDialogDragging.value = false;
    settingsDialogPosition.value = { x: 0, y: 0 };
}
async function saveSettings() {
    if (!auth.token)
        return;
    settingsBusy.value = true;
    try {
        setBranding(settingsForm.value);
        await api.updateAdminPreviewWatermark({
            enabled: settingsForm.value.watermarkEnabled,
            mode: settingsForm.value.watermarkMode,
            text: settingsForm.value.watermarkText,
            color: settingsForm.value.watermarkColor,
            fontSize: settingsForm.value.watermarkFontSize,
            opacity: settingsForm.value.watermarkOpacity,
            rotate: settingsForm.value.watermarkRotate,
            gapX: settingsForm.value.watermarkGapX,
            gapY: settingsForm.value.watermarkGapY
        }, auth.token);
        await workspace.loadAdminWorkspace(auth.token);
        statusMessage.value = "参数设置已保存";
        showSettings.value = false;
    }
    catch (error) {
        statusMessage.value = error instanceof Error ? error.message : "保存参数设置失败";
    }
    finally {
        settingsBusy.value = false;
    }
}
function stopSettingsDrag() {
    settingsDialogDragging.value = false;
}
function handleSettingsDragMove(event) {
    if (!settingsDialogDragging.value) {
        return;
    }
    settingsDialogPosition.value = {
        x: settingsDialogDragStart.value.x + event.clientX - settingsDialogDragStart.value.pointerX,
        y: settingsDialogDragStart.value.y + event.clientY - settingsDialogDragStart.value.pointerY
    };
}
function startSettingsDrag(event) {
    if (window.innerWidth <= 1024) {
        return;
    }
    const target = event.target;
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
async function handleFaviconChange(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file)
        return;
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("图标读取失败"));
        reader.readAsDataURL(file);
    });
    settingsForm.value.faviconHref = dataUrl;
    input.value = "";
}
async function deleteDocument(id, title) {
    if (!auth.token)
        return;
    const confirmed = window.confirm(`确认删除文档“${title}”吗？`);
    if (!confirmed)
        return;
    try {
        await api.deleteDocument(id, auth.token);
        await workspace.loadAdminWorkspace(auth.token);
        statusMessage.value = "文档已删除";
    }
    catch (error) {
        statusMessage.value = error instanceof Error ? error.message : "删除失败";
    }
}
async function selectDocument(doc) {
    workspace.setActive(doc.id);
    if (!auth.token || !workspace.usingAdminData) {
        return;
    }
    try {
        await workspace.loadDocumentDetail(doc.id, auth.token);
    }
    catch (error) {
        statusMessage.value = error instanceof Error ? error.message : "读取文档详情失败";
    }
}
async function deleteSelectedDocuments() {
    if (!auth.token || selectedDocumentIds.value.length === 0)
        return;
    const docs = workspace.docs.filter((doc) => selectedDocumentIds.value.includes(doc.id));
    const confirmed = window.confirm(`确认删除已选择的 ${docs.length} 个文档吗？`);
    if (!confirmed)
        return;
    try {
        for (const doc of docs) {
            await api.deleteDocument(doc.id, auth.token);
        }
        await workspace.loadAdminWorkspace(auth.token);
        clearSelection();
        statusMessage.value = `已删除 ${docs.length} 个文档`;
    }
    catch (error) {
        statusMessage.value = error instanceof Error ? error.message : "批量删除失败";
    }
}
watch(() => workspace.docs.map((doc) => doc.id), (ids) => {
    selectedDocumentIds.value = selectedDocumentIds.value.filter((id) => ids.includes(id));
}, { immediate: true });
watch(() => workspace.activeId, async () => {
    await nextTick();
    setEditorScrollRatio(0);
    previewFrame.value?.setScrollRatio(0);
    closeAttributes();
});
watch(filteredDocs, (docs) => {
    if (docs.length === 0) {
        return;
    }
    if (!docs.some((doc) => doc.id === workspace.activeId)) {
        void selectDocument(docs[0]);
    }
}, { immediate: true });
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
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['pane-header']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['search-box']} */ ;
/** @type {__VLS_StyleScopedClasses['search-box']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-legal-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-legal-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-legal-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-all']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-all']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-list']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-action']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-action']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-body']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-block-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-block-head']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-field']} */ ;
/** @type {__VLS_StyleScopedClasses['color-field']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-domain-card']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-strong-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-action']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-split']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-actions-sticky']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-split']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-submit']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workspace-admin" },
});
if (!__VLS_ctx.auth.isLoggedIn) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "login-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "login-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "panel-eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({});
    (__VLS_ctx.loginForm.username);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "password",
    });
    (__VLS_ctx.loginForm.password);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({});
    (__VLS_ctx.loginForm.captcha);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.login) },
        ...{ class: "primary-btn" },
        disabled: (__VLS_ctx.auth.loading),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "power-off",
        fixedWidth: true,
    }));
    const __VLS_1 = __VLS_0({
        name: "power-off",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.loginError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "error" },
        });
        (__VLS_ctx.loginError);
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "workspace" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "file-pane" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pane-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "pane-eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "search-box" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "magnifying-glass",
        fixedWidth: true,
        ...{ class: "search-icon" },
    }));
    const __VLS_4 = __VLS_3({
        name: "magnifying-glass",
        fixedWidth: true,
        ...{ class: "search-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        value: (__VLS_ctx.search),
        type: "text",
        placeholder: "搜索标题、业务领域、效力层级...",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "admin-legal-nav" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.auth.isLoggedIn))
                    return;
                __VLS_ctx.setLegalLevel('');
            } },
        type: "button",
        ...{ class: "admin-legal-pill" },
        ...{ class: ({ active: !__VLS_ctx.activeLegalLevel }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.countDocsForAllLegal());
    for (const [level] of __VLS_getVForSourceType((__VLS_ctx.legalTabs))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.auth.isLoggedIn))
                        return;
                    __VLS_ctx.setLegalLevel(level);
                } },
            key: (level),
            type: "button",
            ...{ class: "admin-legal-pill" },
            ...{ class: ({ active: __VLS_ctx.activeLegalLevel === level }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (level);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.countDocsForLegal(level));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pane-tools" },
        ...{ class: ({ active: __VLS_ctx.workspace.loading || __VLS_ctx.selectedCount > 0 }) },
    });
    if (__VLS_ctx.workspace.loading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "status" },
        });
    }
    if (__VLS_ctx.selectedCount > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tree-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.selectedCount);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tree-action-buttons" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.deleteSelectedDocuments) },
            type: "button",
            ...{ class: "subtle-btn" },
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "trash-can",
            fixedWidth: true,
        }));
        const __VLS_7 = __VLS_6({
            name: "trash-can",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.clearSelection) },
            type: "button",
            ...{ class: "subtle-btn" },
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "xmark",
            fixedWidth: true,
        }));
        const __VLS_10 = __VLS_9({
            name: "xmark",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "folder-tree admin-doc-browser" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "admin-business-filter" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearBusinessPath) },
        type: "button",
        ...{ class: "admin-business-all" },
        ...{ class: ({ active: __VLS_ctx.activeBusinessPath.length === 0 }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.countDocsForAllBusiness());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "admin-business-tree" },
    });
    for (const [node] of __VLS_getVForSourceType((__VLS_ctx.businessRoots))) {
        (node.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.auth.isLoggedIn))
                        return;
                    __VLS_ctx.selectBusinessPath([node.name]);
                } },
            type: "button",
            ...{ class: "admin-business-item" },
            ...{ class: ({ active: __VLS_ctx.isBusinessPathActive([node.name]) }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (node.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.countDocsForBusiness([node.name]));
        for (const [child] of __VLS_getVForSourceType((node.children))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.auth.isLoggedIn))
                            return;
                        __VLS_ctx.selectBusinessPath([node.name, child.name]);
                    } },
                key: (`${node.name}/${child.name}`),
                type: "button",
                ...{ class: "admin-business-item child" },
                ...{ class: ({ active: __VLS_ctx.isBusinessPathActive([node.name, child.name]) }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (child.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.countDocsForBusiness([node.name, child.name]));
        }
        for (const [child] of __VLS_getVForSourceType((node.children.flatMap((item) => item.children.map((grandchild) => ({ parent: item.name, name: grandchild.name })))))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.auth.isLoggedIn))
                            return;
                        __VLS_ctx.selectBusinessPath([node.name, child.parent, child.name]);
                    } },
                key: (`${node.name}/${child.parent}/${child.name}`),
                type: "button",
                ...{ class: "admin-business-item grandchild" },
                ...{ class: ({ active: __VLS_ctx.isBusinessPathActive([node.name, child.parent, child.name]) }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (child.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.countDocsForBusiness([node.name, child.parent, child.name]));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "admin-doc-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "admin-doc-list-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.activeLegalSummary);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.filteredDocs.length);
    for (const [doc] of __VLS_getVForSourceType((__VLS_ctx.filteredDocs))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.auth.isLoggedIn))
                        return;
                    __VLS_ctx.selectDocument(doc);
                } },
            key: (doc.id),
            type: "button",
            ...{ class: "admin-doc-item" },
            ...{ class: ({ active: __VLS_ctx.workspace.activeId === doc.id }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "admin-doc-main" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onClick: () => { } },
            ...{ onChange: (...[$event]) => {
                    if (!!(!__VLS_ctx.auth.isLoggedIn))
                        return;
                    __VLS_ctx.toggleDocumentSelection(doc);
                } },
            type: "checkbox",
            ...{ class: "admin-doc-check" },
            checked: (__VLS_ctx.selectedDocumentIds.includes(doc.id)),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "admin-doc-copy" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
            ...{ class: "admin-doc-title" },
        });
        (doc.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "admin-doc-meta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "admin-doc-tag" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        (doc.businessPath.join(" / ") || "未设置");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "admin-doc-tag" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        (doc.legalPath.join(" / ") || "未设置");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "admin-doc-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.auth.isLoggedIn))
                        return;
                    __VLS_ctx.deleteDocument(doc.id, doc.title);
                } },
            type: "button",
            ...{ class: "subtle-btn admin-doc-action danger" },
            title: "删除文档",
            'aria-label': "删除文档",
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "trash-can",
            fixedWidth: true,
        }));
        const __VLS_13 = __VLS_12({
            name: "trash-can",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "editor-pane" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "editor-tabs" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "editor-topline" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        type: "button",
        ...{ class: "tab active" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "pen-to-square",
        fixedWidth: true,
    }));
    const __VLS_16 = __VLS_15({
        name: "pen-to-square",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.workspace.activeDocument?.title || "未选择文档");
    if (__VLS_ctx.workspace.activeDocument) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "editor-body" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "editor-fields" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            disabled: (__VLS_ctx.workspace.activeDocumentLoading),
        });
        (__VLS_ctx.workspace.editorTitle);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            value: (`${__VLS_ctx.workspace.editorBusinessPath.join(' / ') || '未设置业务领域'} | ${__VLS_ctx.workspace.editorLegalPath.join(' / ') || '未设置效力层级'}`),
            disabled: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "editor-split" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "editor-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-title panel-title-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-title-main" },
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "code",
            fixedWidth: true,
        }));
        const __VLS_19 = __VLS_18({
            name: "code",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.normalizeMarkdown) },
            type: "button",
            ...{ class: "subtle-btn convert-btn" },
            disabled: (__VLS_ctx.formatBusy || __VLS_ctx.workspace.activeDocumentLoading),
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "wand-magic-sparkles",
            fixedWidth: true,
        }));
        const __VLS_22 = __VLS_21({
            name: "wand-magic-sparkles",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.formatBusy ? "大模型处理中..." : "一键转换md格式");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "editor-field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
            ...{ onScroll: (__VLS_ctx.syncPreviewFromEditor) },
            ref: "markdownTextarea",
            value: (__VLS_ctx.workspace.editorMarkdown),
            disabled: (__VLS_ctx.workspace.activeDocumentLoading),
        });
        /** @type {typeof __VLS_ctx.markdownTextarea} */ ;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "preview-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-title" },
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_24 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "eye",
            fixedWidth: true,
        }));
        const __VLS_25 = __VLS_24({
            name: "eye",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_24));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-surface" },
        });
        if (__VLS_ctx.workspace.activeDocumentLoading) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "document-loading-state" },
            });
            /** @type {[typeof FaIcon, ]} */ ;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
                name: "spinner",
                fixedWidth: true,
                ...{ class: "spin" },
            }));
            const __VLS_28 = __VLS_27({
                name: "spinner",
                fixedWidth: true,
                ...{ class: "spin" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_27));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
        /** @type {[typeof AdminDocPreview, ]} */ ;
        // @ts-ignore
        const __VLS_30 = __VLS_asFunctionalComponent(AdminDocPreview, new AdminDocPreview({
            ...{ 'onScrollRatio': {} },
            ref: "previewFrame",
            source: (__VLS_ctx.workspace.editorMarkdown),
            persistedHtml: (__VLS_ctx.workspace.activeDocument.previewHtml),
        }));
        const __VLS_31 = __VLS_30({
            ...{ 'onScrollRatio': {} },
            ref: "previewFrame",
            source: (__VLS_ctx.workspace.editorMarkdown),
            persistedHtml: (__VLS_ctx.workspace.activeDocument.previewHtml),
        }, ...__VLS_functionalComponentArgsRest(__VLS_30));
        let __VLS_33;
        let __VLS_34;
        let __VLS_35;
        const __VLS_36 = {
            onScrollRatio: (__VLS_ctx.syncEditorFromPreview)
        };
        /** @type {typeof __VLS_ctx.previewFrame} */ ;
        var __VLS_37 = {};
        var __VLS_32;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
            ...{ class: "editor-footer" },
        });
        if (__VLS_ctx.formatProgress > 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "format-progress" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "format-progress-meta" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.formatStageLabel || "处理中");
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.formatProgress);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "format-progress-track" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "format-progress-fill" },
                ...{ style: ({ width: `${__VLS_ctx.formatProgress}%` }) },
            });
        }
        if (__VLS_ctx.statusMessage) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "status" },
            });
            (__VLS_ctx.statusMessage);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.openSettings) },
            ...{ class: "save-btn secondary-btn" },
            type: "button",
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_39 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "sliders",
            fixedWidth: true,
        }));
        const __VLS_40 = __VLS_39({
            name: "sliders",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_39));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "editor-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.openTaxonomySettings) },
            ...{ class: "save-btn secondary-btn" },
            type: "button",
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_42 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "sitemap",
            fixedWidth: true,
        }));
        const __VLS_43 = __VLS_42({
            name: "sitemap",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_42));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.openAttributes) },
            ...{ class: "save-btn secondary-btn" },
            type: "button",
            disabled: (__VLS_ctx.workspace.activeDocumentLoading),
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "tags",
            fixedWidth: true,
        }));
        const __VLS_46 = __VLS_45({
            name: "tags",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.saveCurrentDocument) },
            ...{ class: "save-btn" },
            disabled: (__VLS_ctx.workspace.saving || __VLS_ctx.workspace.activeDocumentLoading),
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_48 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "floppy-disk",
            fixedWidth: true,
        }));
        const __VLS_49 = __VLS_48({
            name: "floppy-disk",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_48));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.workspace.saving ? "保存中..." : "保存源码");
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "empty-state" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
}
if (__VLS_ctx.showAttributes) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMousedown: (__VLS_ctx.closeAttributes) },
        ...{ class: "settings-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-dialog attribute-dialog" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "settings-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "panel-eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeAttributes) },
        type: "button",
        ...{ class: "icon-btn" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_51 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "xmark",
        fixedWidth: true,
    }));
    const __VLS_52 = __VLS_51({
        name: "xmark",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_51));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.showAttributes))
                    return;
                __VLS_ctx.workspace.setBusinessPathLevel(0, $event.target.value);
            } },
        value: (__VLS_ctx.workspace.editorBusinessPath[0] ?? ''),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.workspace.businessDomainOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (item),
            value: (item),
        });
        (item);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.showAttributes))
                    return;
                __VLS_ctx.workspace.setBusinessPathLevel(1, $event.target.value);
            } },
        value: (__VLS_ctx.workspace.editorBusinessPath[1] ?? ''),
        disabled: (__VLS_ctx.businessLevel2Options.length === 0),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    (__VLS_ctx.businessLevel2Options.length === 0 ? "当前层级无可选项" : "未设置");
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.businessLevel2Options))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (item),
            value: (item),
        });
        (item);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.showAttributes))
                    return;
                __VLS_ctx.workspace.setBusinessPathLevel(2, $event.target.value);
            } },
        value: (__VLS_ctx.workspace.editorBusinessPath[2] ?? ''),
        disabled: (__VLS_ctx.businessLevel3Options.length === 0),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    (__VLS_ctx.businessLevel3Options.length === 0 ? "当前层级无可选项" : "未设置");
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.businessLevel3Options))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (item),
            value: (item),
        });
        (item);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.showAttributes))
                    return;
                __VLS_ctx.workspace.setLegalPathLevel(0, $event.target.value);
            } },
        value: (__VLS_ctx.workspace.editorLegalPath[0] ?? ''),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.workspace.legalLevelOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (item),
            value: (item),
        });
        (item);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.showAttributes))
                    return;
                __VLS_ctx.workspace.setLegalPathLevel(1, $event.target.value);
            } },
        value: (__VLS_ctx.workspace.editorLegalPath[1] ?? ''),
        disabled: (__VLS_ctx.legalLevel2Options.length === 0),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    (__VLS_ctx.legalLevel2Options.length === 0 ? "当前层级无可选项" : "未设置");
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.legalLevel2Options))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (item),
            value: (item),
        });
        (item);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "attribute-wide" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.showAttributes))
                    return;
                __VLS_ctx.workspace.setLegalPathLevel(2, $event.target.value);
            } },
        value: (__VLS_ctx.workspace.editorLegalPath[2] ?? ''),
        disabled: (__VLS_ctx.legalLevel3Options.length === 0),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    (__VLS_ctx.legalLevel3Options.length === 0 ? "当前层级无可选项" : "未设置");
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.legalLevel3Options))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (item),
            value: (item),
        });
        (item);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "settings-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "attribute-summary" },
    });
    (__VLS_ctx.workspace.editorBusinessPath.join(" / ") || "未设置业务领域");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    (__VLS_ctx.workspace.editorLegalPath.join(" / ") || "未设置效力层级");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-submit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.saveDocumentAttributes) },
        type: "button",
        ...{ class: "save-btn" },
        disabled: (__VLS_ctx.workspace.saving),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "floppy-disk",
        fixedWidth: true,
    }));
    const __VLS_55 = __VLS_54({
        name: "floppy-disk",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.workspace.saving ? "保存中..." : "保存属性");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeAttributes) },
        type: "button",
        ...{ class: "save-btn secondary-btn" },
    });
}
if (__VLS_ctx.showTaxonomySettings) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMousedown: (__VLS_ctx.closeTaxonomySettings) },
        ...{ class: "settings-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-dialog taxonomy-dialog" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "settings-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "panel-eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeTaxonomySettings) },
        type: "button",
        ...{ class: "icon-btn" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "xmark",
        fixedWidth: true,
    }));
    const __VLS_58 = __VLS_57({
        name: "xmark",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "taxonomy-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "taxonomy-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "taxonomy-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.taxonomyBusinessPathsText),
        rows: "18",
        placeholder: "如&#10;道路运输&#10;道路运输/道路旅客运输&#10;道路运输/道路旅客运输/班线客运",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "taxonomy-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "taxonomy-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.taxonomyLegalPathsText),
        rows: "18",
        placeholder: "如&#10;法律&#10;行政法规&#10;行政法规/交通运输",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "settings-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "attribute-summary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-submit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeTaxonomySettings) },
        type: "button",
        ...{ class: "save-btn secondary-btn" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.saveTaxonomySettings) },
        type: "button",
        ...{ class: "save-btn" },
        disabled: (__VLS_ctx.taxonomyBusy),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "floppy-disk",
        fixedWidth: true,
    }));
    const __VLS_61 = __VLS_60({
        name: "floppy-disk",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_60));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.taxonomyBusy ? "保存中..." : "保存属性体系");
}
if (__VLS_ctx.showSettings) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.closeSettings) },
        ...{ class: "settings-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-dialog settings-dialog-elevated" },
        ...{ class: ({ dragging: __VLS_ctx.settingsDialogDragging }) },
        ...{ style: ({ transform: `translate(${__VLS_ctx.settingsDialogPosition.x}px, ${__VLS_ctx.settingsDialogPosition.y}px)` }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ onPointerdown: (__VLS_ctx.startSettingsDrag) },
        ...{ class: "settings-header settings-drag-handle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-header-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "panel-eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "settings-header-desc" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-header-tools" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.resetSettingsDialogPosition) },
        type: "button",
        ...{ class: "drag-chip" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_63 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "arrows-up-down-left-right",
        fixedWidth: true,
    }));
    const __VLS_64 = __VLS_63({
        name: "arrows-up-down-left-right",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_63));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeSettings) },
        type: "button",
        ...{ class: "icon-btn" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "xmark",
        fixedWidth: true,
    }));
    const __VLS_67 = __VLS_66({
        name: "xmark",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-scroll" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-layout settings-layout-polished" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-hero" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "panel-eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-hero-metrics" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "metric-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.settingsForm.watermarkEnabled ? "已启用" : "未启用");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "metric-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.settingsForm.watermarkFontSize);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-columns" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-block settings-block-primary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-block-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-form settings-form-compact" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({});
    (__VLS_ctx.settingsForm.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({});
    (__VLS_ctx.settingsForm.subtitle);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "settings-wide" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({});
    (__VLS_ctx.settingsForm.footer);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "settings-wide" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        placeholder: "/favicon.ico 或 data:image/x-icon...",
    });
    (__VLS_ctx.settingsForm.faviconHref);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "settings-wide" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (__VLS_ctx.handleFaviconChange) },
        type: "file",
        accept: ".ico,image/x-icon,image/png,image/svg+xml",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-block settings-block-primary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-block-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-form settings-form-compact" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "toggle-field settings-wide" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "checkbox",
    });
    (__VLS_ctx.settingsForm.watermarkEnabled);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.settingsForm.watermarkMode),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "both",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "view",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "export",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "settings-wide" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.settingsForm.watermarkText),
        rows: "4",
        placeholder: "如：{{username}} {{timestamp}}&#10;{{documentTitle}}&#10;{{ip}}",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "settings-wide" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "color-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "color",
    });
    (__VLS_ctx.settingsForm.watermarkColor);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        placeholder: "#8b949e",
    });
    (__VLS_ctx.settingsForm.watermarkColor);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        min: "12",
        max: "36",
    });
    (__VLS_ctx.settingsForm.watermarkFontSize);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        min: "0.05",
        max: "0.4",
        step: "0.01",
    });
    (__VLS_ctx.settingsForm.watermarkOpacity);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        min: "-45",
        max: "45",
    });
    (__VLS_ctx.settingsForm.watermarkRotate);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        min: "120",
        max: "360",
        step: "10",
    });
    (__VLS_ctx.settingsForm.watermarkGapX);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        min: "100",
        max: "300",
        step: "10",
    });
    (__VLS_ctx.settingsForm.watermarkGapY);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "settings-actions settings-actions-sticky" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-actions-meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-submit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.restoreSettings) },
        type: "button",
        ...{ class: "save-btn secondary-btn" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeSettings) },
        type: "button",
        ...{ class: "save-btn secondary-btn" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.saveSettings) },
        type: "button",
        ...{ class: "save-btn primary-strong-btn" },
        disabled: (__VLS_ctx.settingsBusy),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "floppy-disk",
        fixedWidth: true,
    }));
    const __VLS_70 = __VLS_69({
        name: "floppy-disk",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.settingsBusy ? "保存中..." : "确定并保存");
}
/** @type {__VLS_StyleScopedClasses['workspace-admin']} */ ;
/** @type {__VLS_StyleScopedClasses['login-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['login-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['file-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-header']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['search-box']} */ ;
/** @type {__VLS_StyleScopedClasses['search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-legal-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-legal-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-legal-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-action-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-browser']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-all']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-item']} */ ;
/** @type {__VLS_StyleScopedClasses['child']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-business-item']} */ ;
/** @type {__VLS_StyleScopedClasses['grandchild']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-list']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-list-header']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-item']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-main']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-check']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-title']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-doc-action']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-topline']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-body']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-split']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title-main']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['convert-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['document-loading-state']} */ ;
/** @type {__VLS_StyleScopedClasses['spin']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['format-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['format-progress-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['format-progress-track']} */ ;
/** @type {__VLS_StyleScopedClasses['format-progress-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['action-row']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['attribute-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form']} */ ;
/** @type {__VLS_StyleScopedClasses['attribute-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['attribute-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-header']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-header']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['attribute-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-dialog-elevated']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-layout-polished']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-hero-metrics']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-block']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-block-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-block-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-block']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-block-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-block-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form-compact']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-field']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['color-field']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-actions-sticky']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-actions-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-strong-btn']} */ ;
// @ts-ignore
var __VLS_38 = __VLS_37;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FaIcon: FaIcon,
            AdminDocPreview: AdminDocPreview,
            auth: auth,
            workspace: workspace,
            search: search,
            loginError: loginError,
            statusMessage: statusMessage,
            selectedDocumentIds: selectedDocumentIds,
            showSettings: showSettings,
            settingsBusy: settingsBusy,
            formatBusy: formatBusy,
            formatProgress: formatProgress,
            formatStageLabel: formatStageLabel,
            markdownTextarea: markdownTextarea,
            previewFrame: previewFrame,
            showAttributes: showAttributes,
            showTaxonomySettings: showTaxonomySettings,
            taxonomyBusy: taxonomyBusy,
            taxonomyBusinessPathsText: taxonomyBusinessPathsText,
            taxonomyLegalPathsText: taxonomyLegalPathsText,
            activeBusinessPath: activeBusinessPath,
            activeLegalLevel: activeLegalLevel,
            settingsDialogPosition: settingsDialogPosition,
            settingsDialogDragging: settingsDialogDragging,
            settingsForm: settingsForm,
            loginForm: loginForm,
            businessLevel2Options: businessLevel2Options,
            businessLevel3Options: businessLevel3Options,
            legalLevel2Options: legalLevel2Options,
            legalLevel3Options: legalLevel3Options,
            legalTabs: legalTabs,
            businessRoots: businessRoots,
            filteredDocs: filteredDocs,
            selectedCount: selectedCount,
            activeLegalSummary: activeLegalSummary,
            toggleDocumentSelection: toggleDocumentSelection,
            clearSelection: clearSelection,
            setLegalLevel: setLegalLevel,
            selectBusinessPath: selectBusinessPath,
            clearBusinessPath: clearBusinessPath,
            countDocsForLegal: countDocsForLegal,
            countDocsForBusiness: countDocsForBusiness,
            countDocsForAllLegal: countDocsForAllLegal,
            countDocsForAllBusiness: countDocsForAllBusiness,
            isBusinessPathActive: isBusinessPathActive,
            syncPreviewFromEditor: syncPreviewFromEditor,
            syncEditorFromPreview: syncEditorFromPreview,
            login: login,
            saveCurrentDocument: saveCurrentDocument,
            saveDocumentAttributes: saveDocumentAttributes,
            normalizeMarkdown: normalizeMarkdown,
            openSettings: openSettings,
            openAttributes: openAttributes,
            closeAttributes: closeAttributes,
            openTaxonomySettings: openTaxonomySettings,
            closeTaxonomySettings: closeTaxonomySettings,
            saveTaxonomySettings: saveTaxonomySettings,
            closeSettings: closeSettings,
            saveSettings: saveSettings,
            startSettingsDrag: startSettingsDrag,
            resetSettingsDialogPosition: resetSettingsDialogPosition,
            restoreSettings: restoreSettings,
            handleFaviconChange: handleFaviconChange,
            deleteDocument: deleteDocument,
            selectDocument: selectDocument,
            deleteSelectedDocuments: deleteSelectedDocuments,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
