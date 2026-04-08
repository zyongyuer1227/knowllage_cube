import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useRoute } from "vue-router";
import FaIcon from "./components/FaIcon.vue";
import { useAppSettings } from "./lib/app-settings";
import { useAuthStore } from "./stores/auth";
import { useWorkspaceStore } from "./stores/workspace";
const { branding, effectiveTheme, setTheme, themeMode } = useAppSettings();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const workspace = useWorkspaceStore();
const importInput = ref(null);
const actionMode = ref("");
const actionInput = ref("");
const actionStatus = ref("");
const actionError = ref("");
const actionBusy = ref(false);
const actionProgress = ref(0);
const actionProgressLabel = ref("");
const documentDialogMode = ref("");
const documentDialogTitle = ref("");
const documentDialogBusinessPath = ref([]);
const documentDialogLegalPath = ref([]);
const pendingImportFiles = ref([]);
let progressTimer = null;
const showAdminActions = computed(() => route.path === "/admin" && auth.isLoggedIn);
const bannerVisible = computed(() => actionBusy.value || !!actionError.value || !!actionStatus.value);
const actionPlaceholder = computed(() => actionMode.value === "folder" ? "输入完整文件夹路径，如 法律法规/国家/行政法规" : "输入新文档标题");
const homeLinkTarget = computed(() => (auth.isLoggedIn ? "/admin" : "/"));
const homeLinkLabel = computed(() => (auth.isLoggedIn ? "管理员" : "游客"));
const businessLevel1Options = computed(() => workspace.getBusinessPathOptions([], 0));
const businessLevel2Options = computed(() => workspace.getBusinessPathOptions(documentDialogBusinessPath.value, 1));
const businessLevel3Options = computed(() => workspace.getBusinessPathOptions(documentDialogBusinessPath.value, 2));
const legalLevel1Options = computed(() => workspace.getLegalPathOptions([], 0));
const legalLevel2Options = computed(() => workspace.getLegalPathOptions(documentDialogLegalPath.value, 1));
const legalLevel3Options = computed(() => workspace.getLegalPathOptions(documentDialogLegalPath.value, 2));
const isSingleImport = computed(() => pendingImportFiles.value.length === 1);
const documentDialogHeading = computed(() => (documentDialogMode.value === "import" ? "导入文档属性" : "新建文档"));
const documentDialogConfirmLabel = computed(() => (documentDialogMode.value === "import" ? "开始导入" : "创建文档"));
const documentDialogFileSummary = computed(() => pendingImportFiles.value.length <= 1
    ? pendingImportFiles.value[0]?.name ?? ""
    : `已选择 ${pendingImportFiles.value.length} 个文件，将共用本次属性定义`);
const documentDialogBusinessSummary = computed(() => documentDialogBusinessPath.value.join(" / ") || "未设置业务领域");
const documentDialogLegalSummary = computed(() => documentDialogLegalPath.value.join(" / ") || "未设置效力层级");
function stopProgress() {
    if (progressTimer !== null) {
        window.clearInterval(progressTimer);
        progressTimer = null;
    }
}
function startProgress(label) {
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
function finishProgress(label) {
    actionProgressLabel.value = label;
    actionProgress.value = 100;
    stopProgress();
}
function setProgress(value, label) {
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
function openAction(mode) {
    if (mode === "document") {
        documentDialogMode.value = "create";
        documentDialogTitle.value = "";
        documentDialogBusinessPath.value = [];
        documentDialogLegalPath.value = [];
        pendingImportFiles.value = [];
        actionError.value = "";
        actionStatus.value = "";
        return;
    }
    actionMode.value = mode;
    actionError.value = "";
    actionStatus.value = "";
    actionInput.value = mode === "folder" ? workspace.editorArchivePath.trim() : "";
}
function closeAction() {
    actionMode.value = "";
    actionInput.value = "";
}
function closeDocumentDialog() {
    documentDialogMode.value = "";
    documentDialogTitle.value = "";
    documentDialogBusinessPath.value = [];
    documentDialogLegalPath.value = [];
    pendingImportFiles.value = [];
    if (importInput.value) {
        importInput.value.value = "";
    }
}
async function handleImport(event) {
    const input = event.target;
    const files = Array.from(input.files ?? []);
    if (files.length === 0)
        return;
    pendingImportFiles.value = files;
    documentDialogMode.value = "import";
    documentDialogTitle.value = files.length === 1 ? files[0].name.replace(/\.[^.]+$/, "") : "";
    documentDialogBusinessPath.value = [];
    documentDialogLegalPath.value = [];
    actionError.value = "";
    actionStatus.value = "";
}
async function submitDocumentDialog() {
    if (!auth.token || !documentDialogMode.value)
        return;
    const normalizedTitle = documentDialogTitle.value.trim();
    if (documentDialogMode.value === "create" && !normalizedTitle) {
        actionError.value = "请输入文档标题";
        return;
    }
    const attributes = {
        businessPath: documentDialogBusinessPath.value,
        legalPath: documentDialogLegalPath.value
    };
    actionBusy.value = true;
    actionError.value = "";
    actionStatus.value = "";
    try {
        if (documentDialogMode.value === "create") {
            startProgress("正在创建文档...");
            await workspace.createDocument(auth.token, normalizedTitle, attributes);
            closeDocumentDialog();
            finishProgress("新文档已创建");
            actionStatus.value = "新文档已创建";
            return;
        }
        const files = [...pendingImportFiles.value];
        if (files.length === 0) {
            throw new Error("未选择导入文件");
        }
        const hasWord = files.some((file) => /\.(docx?|DOCX?)$/.test(file.name));
        startProgress("正在上传文档...");
        closeDocumentDialog();
        const result = await workspace.importFiles(auth.token, files, attributes, isSingleImport.value ? normalizedTitle : undefined);
        const tasks = result?.tasks ?? [];
        if (tasks.length > 0) {
            setProgress(12, hasWord ? `上传完成，正在后台转换：${tasks[0]?.fileName ?? "文档"}` : "上传完成，正在处理文档...");
            const finalResult = await workspace.waitForImportTasks(auth.token, tasks, (snapshot) => {
                const ratio = snapshot.total === 0 ? 0 : (snapshot.completed + snapshot.failed) / snapshot.total;
                const percent = Math.round(12 + ratio * 88);
                const label = snapshot.completed + snapshot.failed >= snapshot.total
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
    }
    catch (error) {
        resetProgress();
        actionError.value = error instanceof Error ? error.message : documentDialogMode.value === "create" ? "创建失败" : "导入失败";
    }
    finally {
        resetProgress();
        actionBusy.value = false;
    }
}
async function submitAction() {
    if (!auth.token || !actionMode.value)
        return;
    const value = actionInput.value.trim();
    if (!value) {
        actionError.value = actionMode.value === "folder" ? "请输入文件夹路径" : "请输入文档标题";
        return;
    }
    actionBusy.value = true;
    actionError.value = "";
    actionStatus.value = "";
    startProgress("正在创建文件夹...");
    try {
        await workspace.createFolder(auth.token, value);
        closeAction();
        finishProgress("新文件夹已创建");
        actionStatus.value = "新文件夹已创建";
    }
    catch (error) {
        resetProgress();
        actionError.value = error instanceof Error ? error.message : "操作失败";
    }
    finally {
        resetProgress();
        actionBusy.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['route-page']} */ ;
/** @type {__VLS_StyleScopedClasses['route-page']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['document-form']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-action']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-action']} */ ;
/** @type {__VLS_StyleScopedClasses['document-form']} */ ;
/** @type {__VLS_StyleScopedClasses['document-form']} */ ;
/** @type {__VLS_StyleScopedClasses['document-form']} */ ;
/** @type {__VLS_StyleScopedClasses['document-form']} */ ;
/** @type {__VLS_StyleScopedClasses['document-form']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['document-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['document-title-field']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['document-dialog-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['action-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['action-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-action']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-action']} */ ;
/** @type {__VLS_StyleScopedClasses['document-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['document-form']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero-main']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-submit']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "shell" },
    ...{ class: (`theme-${__VLS_ctx.effectiveTheme}`) },
    ...{ style: ({ '--chrome-offset': `${78 + (__VLS_ctx.bannerVisible ? 32 : 0)}px` }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "topbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "brand" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.branding.title);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.branding.subtitle);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "topbar-tools" },
});
if (__VLS_ctx.showAdminActions) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "admin-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showAdminActions))
                    return;
                __VLS_ctx.importInput?.click();
            } },
        ...{ class: "topbar-btn" },
        type: "button",
        disabled: (__VLS_ctx.actionBusy),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "upload",
        fixedWidth: true,
    }));
    const __VLS_1 = __VLS_0({
        name: "upload",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showAdminActions))
                    return;
                __VLS_ctx.openAction('document');
            } },
        ...{ class: "topbar-btn" },
        type: "button",
        disabled: (__VLS_ctx.actionBusy),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "file-circle-plus",
        fixedWidth: true,
    }));
    const __VLS_4 = __VLS_3({
        name: "file-circle-plus",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (__VLS_ctx.handleImport) },
        ref: "importInput",
        type: "file",
        ...{ class: "hidden-input" },
        multiple: true,
        accept: ".html,.htm,.txt,.doc,.docx,.pdf",
    });
    /** @type {typeof __VLS_ctx.importInput} */ ;
}
if (__VLS_ctx.showAdminActions && __VLS_ctx.actionMode === 'folder') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submitAction) },
        ...{ class: "inline-action" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: (__VLS_ctx.actionMode === 'folder' ? 'folder-plus' : 'file-circle-plus'),
        fixedWidth: true,
    }));
    const __VLS_7 = __VLS_6({
        name: (__VLS_ctx.actionMode === 'folder' ? 'folder-plus' : 'file-circle-plus'),
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        placeholder: (__VLS_ctx.actionPlaceholder),
    });
    (__VLS_ctx.actionInput);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "topbar-btn compact-btn" },
        type: "submit",
        disabled: (__VLS_ctx.actionBusy),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.actionBusy ? "处理中" : "确定");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeAction) },
        ...{ class: "topbar-btn compact-btn" },
        type: "button",
        disabled: (__VLS_ctx.actionBusy),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "theme-switcher" },
});
/** @type {[typeof FaIcon, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "palette",
    fixedWidth: true,
}));
const __VLS_10 = __VLS_9({
    name: "palette",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
    ...{ onChange: (...[$event]) => {
            __VLS_ctx.setTheme($event.target.value);
        } },
    value: (__VLS_ctx.themeMode),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "light",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "dark",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
    value: "system",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({});
const __VLS_12 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    to: (__VLS_ctx.homeLinkTarget),
}));
const __VLS_14 = __VLS_13({
    to: (__VLS_ctx.homeLinkTarget),
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
/** @type {[typeof FaIcon, ]} */ ;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "desktop",
    fixedWidth: true,
}));
const __VLS_17 = __VLS_16({
    name: "desktop",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.homeLinkLabel);
var __VLS_15;
if (__VLS_ctx.auth.isLoggedIn) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handleLogout) },
        type: "button",
        ...{ class: "nav-link-btn" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "right-from-bracket",
        fixedWidth: true,
    }));
    const __VLS_20 = __VLS_19({
        name: "right-from-bracket",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
else {
    const __VLS_22 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
        to: "/admin",
    }));
    const __VLS_24 = __VLS_23({
        to: "/admin",
    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    __VLS_25.slots.default;
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "gear",
        fixedWidth: true,
    }));
    const __VLS_27 = __VLS_26({
        name: "gear",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    var __VLS_25;
}
if (__VLS_ctx.actionBusy || __VLS_ctx.actionError || __VLS_ctx.actionStatus) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "action-banner" },
        ...{ class: ({ error: !!__VLS_ctx.actionError, busy: __VLS_ctx.actionBusy }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "banner-main" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: (__VLS_ctx.actionError ? 'triangle-exclamation' : __VLS_ctx.actionBusy ? 'spinner' : 'circle-check'),
        fixedWidth: true,
    }));
    const __VLS_30 = __VLS_29({
        name: (__VLS_ctx.actionError ? 'triangle-exclamation' : __VLS_ctx.actionBusy ? 'spinner' : 'circle-check'),
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.actionError || __VLS_ctx.actionStatus || __VLS_ctx.actionProgressLabel);
    if (__VLS_ctx.actionBusy) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "progress-track" },
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "progress-fill" },
            ...{ style: ({ width: `${__VLS_ctx.actionProgress}%` }) },
        });
    }
}
if (__VLS_ctx.documentDialogMode) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-dialog document-dialog" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "settings-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "panel-eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    (__VLS_ctx.documentDialogHeading);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeDocumentDialog) },
        type: "button",
        ...{ class: "icon-btn" },
        disabled: (__VLS_ctx.actionBusy),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "xmark",
        fixedWidth: true,
    }));
    const __VLS_33 = __VLS_32({
        name: "xmark",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "document-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "document-hero" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "document-hero-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "document-hero-icon" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_35 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: (__VLS_ctx.documentDialogMode === 'import' ? 'file-import' : 'file-circle-plus'),
        fixedWidth: true,
    }));
    const __VLS_36 = __VLS_35({
        name: (__VLS_ctx.documentDialogMode === 'import' ? 'file-import' : 'file-circle-plus'),
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_35));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "document-hero-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "document-hero-eyebrow" },
    });
    (__VLS_ctx.documentDialogMode === "import" ? "导入流程" : "新建流程");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.documentDialogMode === "import" ? "先定义文档属性，再进入后台转换" : "先定义文档属性，再创建空白文档");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.documentDialogMode === "import" ? __VLS_ctx.documentDialogFileSummary : "创建后可继续在管理员编辑区维护正文内容与属性。");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "document-hero-tags" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "document-chip" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "folder-tree",
        fixedWidth: true,
    }));
    const __VLS_39 = __VLS_38({
        name: "folder-tree",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.documentDialogBusinessSummary);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "document-chip" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "scale-balanced",
        fixedWidth: true,
    }));
    const __VLS_42 = __VLS_41({
        name: "scale-balanced",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.documentDialogLegalSummary);
    if (__VLS_ctx.documentDialogMode === 'create' || __VLS_ctx.isSingleImport) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "document-title-field" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_44 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "file-lines",
            fixedWidth: true,
        }));
        const __VLS_45 = __VLS_44({
            name: "file-lines",
            fixedWidth: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_44));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            placeholder: (__VLS_ctx.documentDialogMode === 'create' ? '输入文档标题' : '输入导入后的文档标题'),
        });
        (__VLS_ctx.documentDialogTitle);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "document-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "document-card-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "document-card-title" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_47 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "folder-tree",
        fixedWidth: true,
    }));
    const __VLS_48 = __VLS_47({
        name: "folder-tree",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_47));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "document-card-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.documentDialogMode))
                    return;
                __VLS_ctx.documentDialogBusinessPath = [$event.target.value].filter(Boolean);
            } },
        value: (__VLS_ctx.documentDialogBusinessPath[0] ?? ''),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.businessLevel1Options))) {
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
                if (!(__VLS_ctx.documentDialogMode))
                    return;
                __VLS_ctx.documentDialogBusinessPath = [
                    __VLS_ctx.documentDialogBusinessPath[0],
                    $event.target.value
                ].filter(Boolean);
            } },
        value: (__VLS_ctx.documentDialogBusinessPath[1] ?? ''),
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
                if (!(__VLS_ctx.documentDialogMode))
                    return;
                __VLS_ctx.documentDialogBusinessPath = [
                    __VLS_ctx.documentDialogBusinessPath[0],
                    __VLS_ctx.documentDialogBusinessPath[1],
                    $event.target.value
                ].filter(Boolean);
            } },
        value: (__VLS_ctx.documentDialogBusinessPath[2] ?? ''),
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "document-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "document-card-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "document-card-title" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_50 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "scale-balanced",
        fixedWidth: true,
    }));
    const __VLS_51 = __VLS_50({
        name: "scale-balanced",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_50));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "document-card-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.documentDialogMode))
                    return;
                __VLS_ctx.documentDialogLegalPath = [$event.target.value].filter(Boolean);
            } },
        value: (__VLS_ctx.documentDialogLegalPath[0] ?? ''),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.legalLevel1Options))) {
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
                if (!(__VLS_ctx.documentDialogMode))
                    return;
                __VLS_ctx.documentDialogLegalPath = [
                    __VLS_ctx.documentDialogLegalPath[0],
                    $event.target.value
                ].filter(Boolean);
            } },
        value: (__VLS_ctx.documentDialogLegalPath[1] ?? ''),
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!(__VLS_ctx.documentDialogMode))
                    return;
                __VLS_ctx.documentDialogLegalPath = [
                    __VLS_ctx.documentDialogLegalPath[0],
                    __VLS_ctx.documentDialogLegalPath[1],
                    $event.target.value
                ].filter(Boolean);
            } },
        value: (__VLS_ctx.documentDialogLegalPath[2] ?? ''),
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "document-dialog-tip" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "document-chip subtle" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "layer-group",
        fixedWidth: true,
    }));
    const __VLS_54 = __VLS_53({
        name: "layer-group",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "document-chip subtle" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_56 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "pen-ruler",
        fixedWidth: true,
    }));
    const __VLS_57 = __VLS_56({
        name: "pen-ruler",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_56));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-submit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeDocumentDialog) },
        type: "button",
        ...{ class: "save-btn secondary-btn" },
        disabled: (__VLS_ctx.actionBusy),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.submitDocumentDialog) },
        type: "button",
        ...{ class: "save-btn" },
        disabled: (__VLS_ctx.actionBusy),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_59 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: (__VLS_ctx.documentDialogMode === 'import' ? 'upload' : 'file-circle-plus'),
        fixedWidth: true,
    }));
    const __VLS_60 = __VLS_59({
        name: (__VLS_ctx.documentDialogMode === 'import' ? 'upload' : 'file-circle-plus'),
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_59));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.actionBusy ? "处理中..." : __VLS_ctx.documentDialogConfirmLabel);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "app-content" },
});
const __VLS_62 = {}.RouterView;
/** @type {[typeof __VLS_components.RouterView, typeof __VLS_components.RouterView, ]} */ ;
// @ts-ignore
const __VLS_63 = __VLS_asFunctionalComponent(__VLS_62, new __VLS_62({}));
const __VLS_64 = __VLS_63({}, ...__VLS_functionalComponentArgsRest(__VLS_63));
{
    const { default: __VLS_thisSlot } = __VLS_65.slots;
    const [{ Component }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "route-page" },
    });
    const __VLS_66 = ((Component));
    // @ts-ignore
    const __VLS_67 = __VLS_asFunctionalComponent(__VLS_66, new __VLS_66({
        ...{ class: "route-screen" },
    }));
    const __VLS_68 = __VLS_67({
        ...{ class: "route-screen" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_67));
    __VLS_65.slots['' /* empty slot name completion */];
}
var __VLS_65;
__VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
    ...{ class: "app-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.branding.footer);
/** @type {__VLS_StyleScopedClasses['shell']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden-input']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-action']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-link-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['action-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-main']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-track']} */ ;
/** @type {__VLS_StyleScopedClasses['progress-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['document-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['document-form']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero-main']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['document-hero-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['document-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['document-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['document-title-field']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['document-card-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['document-dialog-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['document-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle']} */ ;
/** @type {__VLS_StyleScopedClasses['document-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['subtle']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-submit']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['app-content']} */ ;
/** @type {__VLS_StyleScopedClasses['route-page']} */ ;
/** @type {__VLS_StyleScopedClasses['route-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['app-footer']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FaIcon: FaIcon,
            branding: branding,
            effectiveTheme: effectiveTheme,
            setTheme: setTheme,
            themeMode: themeMode,
            auth: auth,
            importInput: importInput,
            actionMode: actionMode,
            actionInput: actionInput,
            actionStatus: actionStatus,
            actionError: actionError,
            actionBusy: actionBusy,
            actionProgress: actionProgress,
            actionProgressLabel: actionProgressLabel,
            documentDialogMode: documentDialogMode,
            documentDialogTitle: documentDialogTitle,
            documentDialogBusinessPath: documentDialogBusinessPath,
            documentDialogLegalPath: documentDialogLegalPath,
            showAdminActions: showAdminActions,
            bannerVisible: bannerVisible,
            actionPlaceholder: actionPlaceholder,
            homeLinkTarget: homeLinkTarget,
            homeLinkLabel: homeLinkLabel,
            businessLevel1Options: businessLevel1Options,
            businessLevel2Options: businessLevel2Options,
            businessLevel3Options: businessLevel3Options,
            legalLevel1Options: legalLevel1Options,
            legalLevel2Options: legalLevel2Options,
            legalLevel3Options: legalLevel3Options,
            isSingleImport: isSingleImport,
            documentDialogHeading: documentDialogHeading,
            documentDialogConfirmLabel: documentDialogConfirmLabel,
            documentDialogFileSummary: documentDialogFileSummary,
            documentDialogBusinessSummary: documentDialogBusinessSummary,
            documentDialogLegalSummary: documentDialogLegalSummary,
            handleLogout: handleLogout,
            openAction: openAction,
            closeAction: closeAction,
            closeDocumentDialog: closeDocumentDialog,
            handleImport: handleImport,
            submitDocumentDialog: submitDocumentDialog,
            submitAction: submitAction,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
