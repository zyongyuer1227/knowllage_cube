import { computed, nextTick, onMounted, ref, watch } from "vue";
import FaIcon from "../components/FaIcon.vue";
import GovDocPreview from "../components/GovDocPreview.vue";
import WorkspaceTree from "../components/WorkspaceTree.vue";
import { useAppSettings } from "../lib/app-settings";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { useWorkspaceStore } from "../stores/workspace";
const auth = useAuthStore();
const workspace = useWorkspaceStore();
const { branding, defaultBranding, resetBranding, setBranding } = useAppSettings();
const search = ref("");
const loginError = ref("");
const statusMessage = ref("");
const openFolders = ref([]);
const selectedDocumentIds = ref([]);
const showSettings = ref(false);
const settingsBusy = ref(false);
const formatBusy = ref(false);
const formatProgress = ref(0);
const formatStageLabel = ref("");
const markdownTextarea = ref(null);
const previewFrame = ref(null);
const syncSource = ref(null);
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
    const keys = [];
    const walk = (nodes) => {
        nodes.forEach((node) => {
            keys.push(node.key);
            walk(node.children);
        });
    };
    walk(workspace.tree);
    return keys;
});
function isFolderOpen(key) {
    return openFolders.value.includes(key);
}
function toggleFolder(key) {
    if (isFolderOpen(key)) {
        openFolders.value = openFolders.value.filter((item) => item !== key);
        return;
    }
    openFolders.value = [...openFolders.value, key];
}
const selectedCount = computed(() => selectedDocumentIds.value.length);
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
    if (!auth.token)
        return;
    try {
        await workspace.saveActiveDocument(auth.token);
        statusMessage.value = "源码已保存";
    }
    catch (error) {
        statusMessage.value = error instanceof Error ? error.message : "保存失败";
    }
}
async function normalizeMarkdown() {
    if (!auth.token)
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
    }
    finally {
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
async function moveDocumentToPath(doc, targetPath) {
    if (!auth.token)
        return;
    if (doc.archivePath === targetPath || (!doc.archivePath && targetPath === "未归档")) {
        return;
    }
    try {
        await workspace.moveDocument(auth.token, doc.id, targetPath);
        workspace.setSelectedFolder(targetPath);
        statusMessage.value = `已移动“${doc.title}”`;
    }
    catch (error) {
        statusMessage.value = error instanceof Error ? error.message : "移动失败";
    }
}
watch(treeKeys, (keys) => {
    openFolders.value = Array.from(new Set([...openFolders.value.filter((item) => keys.includes(item)), ...keys]));
}, { immediate: true });
watch(() => workspace.docs.map((doc) => doc.id), (ids) => {
    selectedDocumentIds.value = selectedDocumentIds.value.filter((id) => ids.includes(id));
}, { immediate: true });
watch(() => workspace.activeId, async () => {
    await nextTick();
    setEditorScrollRatio(0);
    previewFrame.value?.setScrollRatio(0);
});
onMounted(async () => {
    workspace.ensureInitialized();
    if (auth.token) {
        await workspace.loadAdminWorkspace(auth.token);
    }
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
/** @type {__VLS_StyleScopedClasses['pane-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-body']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-split']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form']} */ ;
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
        placeholder: "过滤文件...",
    });
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
        ...{ class: "folder-tree" },
    });
    /** @type {[typeof WorkspaceTree, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(WorkspaceTree, new WorkspaceTree({
        ...{ 'onToggle': {} },
        ...{ 'onSelectFolder': {} },
        ...{ 'onSelect': {} },
        ...{ 'onDelete': {} },
        ...{ 'onToggleSelect': {} },
        ...{ 'onMove': {} },
        nodes: (__VLS_ctx.workspace.tree),
        activeId: (__VLS_ctx.workspace.activeId),
        activeFolderPath: (__VLS_ctx.workspace.selectedFolderPath),
        search: (__VLS_ctx.search),
        openKeys: (__VLS_ctx.openFolders),
        canDelete: true,
        selectedIds: (__VLS_ctx.selectedDocumentIds),
    }));
    const __VLS_13 = __VLS_12({
        ...{ 'onToggle': {} },
        ...{ 'onSelectFolder': {} },
        ...{ 'onSelect': {} },
        ...{ 'onDelete': {} },
        ...{ 'onToggleSelect': {} },
        ...{ 'onMove': {} },
        nodes: (__VLS_ctx.workspace.tree),
        activeId: (__VLS_ctx.workspace.activeId),
        activeFolderPath: (__VLS_ctx.workspace.selectedFolderPath),
        search: (__VLS_ctx.search),
        openKeys: (__VLS_ctx.openFolders),
        canDelete: true,
        selectedIds: (__VLS_ctx.selectedDocumentIds),
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    let __VLS_15;
    let __VLS_16;
    let __VLS_17;
    const __VLS_18 = {
        onToggle: (__VLS_ctx.toggleFolder)
    };
    const __VLS_19 = {
        onSelectFolder: (...[$event]) => {
            if (!!(!__VLS_ctx.auth.isLoggedIn))
                return;
            __VLS_ctx.workspace.setSelectedFolder($event);
        }
    };
    const __VLS_20 = {
        onSelect: (...[$event]) => {
            if (!!(!__VLS_ctx.auth.isLoggedIn))
                return;
            __VLS_ctx.workspace.setActive($event.id);
        }
    };
    const __VLS_21 = {
        onDelete: (...[$event]) => {
            if (!!(!__VLS_ctx.auth.isLoggedIn))
                return;
            __VLS_ctx.deleteDocument($event.id, $event.title);
        }
    };
    const __VLS_22 = {
        onToggleSelect: (__VLS_ctx.toggleDocumentSelection)
    };
    const __VLS_23 = {
        onMove: (...[$event]) => {
            if (!!(!__VLS_ctx.auth.isLoggedIn))
                return;
            __VLS_ctx.moveDocumentToPath($event.doc, $event.targetPath);
        }
    };
    var __VLS_14;
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
    const __VLS_24 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "pen-to-square",
        fixedWidth: true,
    }));
    const __VLS_25 = __VLS_24({
        name: "pen-to-square",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({});
        (__VLS_ctx.workspace.editorTitle);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            placeholder: "如 policy/national/2026",
        });
        (__VLS_ctx.workspace.editorArchivePath);
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
        const __VLS_27 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "code",
            fixedWidth: true,
        }));
        const __VLS_28 = __VLS_27({
            name: "code",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_27));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.normalizeMarkdown) },
            type: "button",
            ...{ class: "subtle-btn convert-btn" },
            disabled: (__VLS_ctx.formatBusy),
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_30 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "wand-magic-sparkles",
            fixedWidth: true,
        }));
        const __VLS_31 = __VLS_30({
            name: "wand-magic-sparkles",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_30));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.formatBusy ? "大模型处理中..." : "一键转换md格式");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "editor-field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
            ...{ onScroll: (__VLS_ctx.syncPreviewFromEditor) },
            ref: "markdownTextarea",
            value: (__VLS_ctx.workspace.editorMarkdown),
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
        const __VLS_33 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "eye",
            fixedWidth: true,
        }));
        const __VLS_34 = __VLS_33({
            name: "eye",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-surface" },
        });
        /** @type {[typeof GovDocPreview, ]} */ ;
        // @ts-ignore
        const __VLS_36 = __VLS_asFunctionalComponent(GovDocPreview, new GovDocPreview({
            ...{ 'onScrollRatio': {} },
            ref: "previewFrame",
            source: (__VLS_ctx.workspace.editorMarkdown),
        }));
        const __VLS_37 = __VLS_36({
            ...{ 'onScrollRatio': {} },
            ref: "previewFrame",
            source: (__VLS_ctx.workspace.editorMarkdown),
        }, ...__VLS_functionalComponentArgsRest(__VLS_36));
        let __VLS_39;
        let __VLS_40;
        let __VLS_41;
        const __VLS_42 = {
            onScrollRatio: (__VLS_ctx.syncEditorFromPreview)
        };
        /** @type {typeof __VLS_ctx.previewFrame} */ ;
        var __VLS_43 = {};
        var __VLS_38;
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
        const __VLS_45 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "sliders",
            fixedWidth: true,
        }));
        const __VLS_46 = __VLS_45({
            name: "sliders",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.saveCurrentDocument) },
            ...{ class: "save-btn" },
            disabled: (__VLS_ctx.workspace.saving),
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
if (__VLS_ctx.showSettings) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMousedown: (__VLS_ctx.handleSettingsBackdropPointerDown) },
        ...{ onMouseup: (__VLS_ctx.handleSettingsBackdropPointerUp) },
        ...{ class: "settings-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ onMousedown: (__VLS_ctx.cancelSettingsBackdropClose) },
        ...{ onMouseup: (__VLS_ctx.cancelSettingsBackdropClose) },
        ...{ class: "settings-dialog" },
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
        ...{ onClick: (__VLS_ctx.closeSettings) },
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({});
    (__VLS_ctx.settingsForm.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({});
    (__VLS_ctx.settingsForm.subtitle);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({});
    (__VLS_ctx.settingsForm.footer);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        placeholder: "/favicon.ico 或 data:image/x-icon...",
    });
    (__VLS_ctx.settingsForm.faviconHref);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (__VLS_ctx.handleFaviconChange) },
        type: "file",
        accept: ".ico,image/x-icon,image/png,image/svg+xml",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "settings-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.restoreSettings) },
        type: "button",
        ...{ class: "save-btn secondary-btn" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-submit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeSettings) },
        type: "button",
        ...{ class: "save-btn secondary-btn" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.saveSettings) },
        type: "button",
        ...{ class: "save-btn" },
        disabled: (__VLS_ctx.settingsBusy),
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
    (__VLS_ctx.settingsBusy ? "保存中..." : "保存设置");
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
/** @type {__VLS_StyleScopedClasses['pane-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['tree-action-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-tree']} */ ;
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
/** @type {__VLS_StyleScopedClasses['editor-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['format-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['format-progress-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['format-progress-track']} */ ;
/** @type {__VLS_StyleScopedClasses['format-progress-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['action-row']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-form']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
// @ts-ignore
var __VLS_44 = __VLS_43;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FaIcon: FaIcon,
            GovDocPreview: GovDocPreview,
            WorkspaceTree: WorkspaceTree,
            auth: auth,
            workspace: workspace,
            search: search,
            loginError: loginError,
            statusMessage: statusMessage,
            openFolders: openFolders,
            selectedDocumentIds: selectedDocumentIds,
            showSettings: showSettings,
            settingsBusy: settingsBusy,
            formatBusy: formatBusy,
            formatProgress: formatProgress,
            formatStageLabel: formatStageLabel,
            markdownTextarea: markdownTextarea,
            previewFrame: previewFrame,
            settingsForm: settingsForm,
            loginForm: loginForm,
            toggleFolder: toggleFolder,
            selectedCount: selectedCount,
            toggleDocumentSelection: toggleDocumentSelection,
            clearSelection: clearSelection,
            syncPreviewFromEditor: syncPreviewFromEditor,
            syncEditorFromPreview: syncEditorFromPreview,
            login: login,
            saveCurrentDocument: saveCurrentDocument,
            normalizeMarkdown: normalizeMarkdown,
            openSettings: openSettings,
            closeSettings: closeSettings,
            saveSettings: saveSettings,
            handleSettingsBackdropPointerDown: handleSettingsBackdropPointerDown,
            handleSettingsBackdropPointerUp: handleSettingsBackdropPointerUp,
            cancelSettingsBackdropClose: cancelSettingsBackdropClose,
            restoreSettings: restoreSettings,
            handleFaviconChange: handleFaviconChange,
            deleteDocument: deleteDocument,
            deleteSelectedDocuments: deleteSelectedDocuments,
            moveDocumentToPath: moveDocumentToPath,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
