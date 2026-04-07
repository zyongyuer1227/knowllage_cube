import { computed, onMounted, ref, watch } from "vue";
import FaIcon from "../components/FaIcon.vue";
import GovDocPreview from "../components/GovDocPreview.vue";
import WorkspaceTree from "../components/WorkspaceTree.vue";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../stores/workspace";
const workspace = useWorkspaceStore();
const search = ref("");
const sidebarCollapsed = ref(false);
const openFolders = ref([]);
const exportBusy = ref(false);
const exportError = ref("");
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
function isOpen(key) {
    return openFolders.value.includes(key);
}
function toggleFolder(key) {
    if (isOpen(key)) {
        openFolders.value = openFolders.value.filter((item) => item !== key);
        return;
    }
    openFolders.value = [...openFolders.value, key];
}
watch(treeKeys, (keys) => {
    openFolders.value = Array.from(new Set([...openFolders.value.filter((item) => keys.includes(item)), ...keys]));
}, { immediate: true });
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
    }
    catch (error) {
        exportError.value = error instanceof Error ? error.message : "导出失败";
    }
    finally {
        exportBusy.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-header']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['search-box']} */ ;
/** @type {__VLS_StyleScopedClasses['search-box']} */ ;
/** @type {__VLS_StyleScopedClasses['collapse-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['export-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['export-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['file-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['collapsed']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-surface']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workspace" },
    ...{ class: ({ collapsed: __VLS_ctx.sidebarCollapsed }) },
});
if (!__VLS_ctx.sidebarCollapsed) {
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.sidebarCollapsed))
                    return;
                __VLS_ctx.sidebarCollapsed = true;
            } },
        type: "button",
        ...{ class: "collapse-btn icon-only" },
        'aria-label': "收起文档栏",
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "chevron-left",
        fixedWidth: true,
    }));
    const __VLS_1 = __VLS_0({
        name: "chevron-left",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
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
        ...{ class: "folder-tree" },
    });
    /** @type {[typeof WorkspaceTree, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(WorkspaceTree, new WorkspaceTree({
        ...{ 'onToggle': {} },
        ...{ 'onSelect': {} },
        nodes: (__VLS_ctx.workspace.tree),
        activeId: (__VLS_ctx.workspace.activeId),
        search: (__VLS_ctx.search),
        openKeys: (__VLS_ctx.openFolders),
    }));
    const __VLS_7 = __VLS_6({
        ...{ 'onToggle': {} },
        ...{ 'onSelect': {} },
        nodes: (__VLS_ctx.workspace.tree),
        activeId: (__VLS_ctx.workspace.activeId),
        search: (__VLS_ctx.search),
        openKeys: (__VLS_ctx.openFolders),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    let __VLS_9;
    let __VLS_10;
    let __VLS_11;
    const __VLS_12 = {
        onToggle: (__VLS_ctx.toggleFolder)
    };
    const __VLS_13 = {
        onSelect: (...[$event]) => {
            if (!(!__VLS_ctx.sidebarCollapsed))
                return;
            __VLS_ctx.workspace.setActive($event.id);
        }
    };
    var __VLS_8;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "sidebar-collapsed" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.sidebarCollapsed))
                    return;
                __VLS_ctx.sidebarCollapsed = false;
            } },
        type: "button",
        ...{ class: "sidebar-handle" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "chevron-right",
        fixedWidth: true,
    }));
    const __VLS_15 = __VLS_14({
        name: "chevron-right",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
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
const __VLS_17 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "file-lines",
    fixedWidth: true,
}));
const __VLS_18 = __VLS_17({
    name: "file-lines",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.workspace.activeDocument?.title || "未选择文档");
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "guest-actions" },
});
if (/^\d+$/.test(__VLS_ctx.workspace.activeDocument?.id || '')) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.exportCurrentDocument) },
        type: "button",
        ...{ class: "export-btn" },
        disabled: (__VLS_ctx.exportBusy),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "file-arrow-down",
        fixedWidth: true,
    }));
    const __VLS_21 = __VLS_20({
        name: "file-arrow-down",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.exportBusy ? "导出中..." : "导出文档");
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "editor-surface" },
});
if (__VLS_ctx.exportError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "guest-banner error" },
    });
    (__VLS_ctx.exportError);
}
if (__VLS_ctx.workspace.activeDocument) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "guest-preview-shell" },
    });
    /** @type {[typeof GovDocPreview, ]} */ ;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent(GovDocPreview, new GovDocPreview({
        source: (__VLS_ctx.workspace.activeDocument.markdownSource),
        persistedHtml: (__VLS_ctx.workspace.activeDocument.previewHtml),
        autoHeight: true,
    }));
    const __VLS_24 = __VLS_23({
        source: (__VLS_ctx.workspace.activeDocument.markdownSource),
        persistedHtml: (__VLS_ctx.workspace.activeDocument.previewHtml),
        autoHeight: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "guest-empty-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
/** @type {__VLS_StyleScopedClasses['workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['file-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-header']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['collapse-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-only']} */ ;
/** @type {__VLS_StyleScopedClasses['search-box']} */ ;
/** @type {__VLS_StyleScopedClasses['search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-collapsed']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-topline']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['export-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-preview-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-empty-state']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FaIcon: FaIcon,
            GovDocPreview: GovDocPreview,
            WorkspaceTree: WorkspaceTree,
            workspace: workspace,
            search: search,
            sidebarCollapsed: sidebarCollapsed,
            openFolders: openFolders,
            exportBusy: exportBusy,
            exportError: exportError,
            toggleFolder: toggleFolder,
            exportCurrentDocument: exportCurrentDocument,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
