import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import FaIcon from "./components/FaIcon.vue";
import { useAppSettings } from "./lib/app-settings";
import { useAuthStore } from "./stores/auth";
import { useWorkspaceStore } from "./stores/workspace";
const { branding, effectiveTheme, setTheme, themeMode } = useAppSettings();
const auth = useAuthStore();
const route = useRoute();
const workspace = useWorkspaceStore();
const importInput = ref(null);
const actionMode = ref("");
const actionInput = ref("");
const actionStatus = ref("");
const actionError = ref("");
const actionBusy = ref(false);
const showAdminActions = computed(() => route.path === "/admin" && auth.isLoggedIn);
const bannerVisible = computed(() => !!actionError.value || !!actionStatus.value);
const actionPlaceholder = computed(() => actionMode.value === "folder" ? "输入完整文件夹路径，如 法律法规/国家/行政法规" : "输入新文档标题");
function openAction(mode) {
    actionMode.value = mode;
    actionError.value = "";
    actionStatus.value = "";
    actionInput.value = mode === "folder" ? workspace.editorArchivePath.trim() : "";
}
function closeAction() {
    actionMode.value = "";
    actionInput.value = "";
}
async function handleImport(event) {
    if (!auth.token)
        return;
    const input = event.target;
    const files = Array.from(input.files ?? []);
    if (files.length === 0)
        return;
    actionBusy.value = true;
    actionError.value = "";
    actionStatus.value = "";
    try {
        await workspace.importFiles(auth.token, files);
        actionStatus.value = `已导入 ${files.length} 个文件`;
    }
    catch (error) {
        actionError.value = error instanceof Error ? error.message : "导入失败";
    }
    finally {
        actionBusy.value = false;
        input.value = "";
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
    try {
        if (actionMode.value === "document") {
            await workspace.createDocument(auth.token, value);
            closeAction();
            actionStatus.value = "新文档已创建";
        }
        else {
            await workspace.createFolder(auth.token, value);
            closeAction();
            actionStatus.value = "新文件夹已创建";
        }
    }
    catch (error) {
        actionError.value = error instanceof Error ? error.message : "操作失败";
    }
    finally {
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
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-action']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-action']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['action-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['admin-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-action']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-action']} */ ;
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showAdminActions))
                    return;
                __VLS_ctx.openAction('folder');
            } },
        ...{ class: "topbar-btn" },
        type: "button",
        disabled: (__VLS_ctx.actionBusy),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "folder-plus",
        fixedWidth: true,
    }));
    const __VLS_7 = __VLS_6({
        name: "folder-plus",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
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
if (__VLS_ctx.showAdminActions && __VLS_ctx.actionMode) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.submitAction) },
        ...{ class: "inline-action" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: (__VLS_ctx.actionMode === 'folder' ? 'folder-plus' : 'file-circle-plus'),
        fixedWidth: true,
    }));
    const __VLS_10 = __VLS_9({
        name: (__VLS_ctx.actionMode === 'folder' ? 'folder-plus' : 'file-circle-plus'),
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
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
const __VLS_12 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "palette",
    fixedWidth: true,
}));
const __VLS_13 = __VLS_12({
    name: "palette",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_12));
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
const __VLS_15 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
    to: "/",
}));
const __VLS_17 = __VLS_16({
    to: "/",
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
__VLS_18.slots.default;
/** @type {[typeof FaIcon, ]} */ ;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "desktop",
    fixedWidth: true,
}));
const __VLS_20 = __VLS_19({
    name: "desktop",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
var __VLS_18;
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
if (__VLS_ctx.actionError || __VLS_ctx.actionStatus) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "action-banner" },
        ...{ class: ({ error: !!__VLS_ctx.actionError }) },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: (__VLS_ctx.actionError ? 'triangle-exclamation' : 'circle-check'),
        fixedWidth: true,
    }));
    const __VLS_30 = __VLS_29({
        name: (__VLS_ctx.actionError ? 'triangle-exclamation' : 'circle-check'),
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.actionError || __VLS_ctx.actionStatus);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "app-content" },
});
const __VLS_32 = {}.RouterView;
/** @type {[typeof __VLS_components.RouterView, typeof __VLS_components.RouterView, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
{
    const { default: __VLS_thisSlot } = __VLS_35.slots;
    const [{ Component }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "route-page" },
    });
    const __VLS_36 = ((Component));
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ class: "route-screen" },
    }));
    const __VLS_38 = __VLS_37({
        ...{ class: "route-screen" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_35.slots['' /* empty slot name completion */];
}
var __VLS_35;
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
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden-input']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-action']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['action-banner']} */ ;
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
            importInput: importInput,
            actionMode: actionMode,
            actionInput: actionInput,
            actionStatus: actionStatus,
            actionError: actionError,
            actionBusy: actionBusy,
            showAdminActions: showAdminActions,
            bannerVisible: bannerVisible,
            actionPlaceholder: actionPlaceholder,
            openAction: openAction,
            closeAction: closeAction,
            handleImport: handleImport,
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
