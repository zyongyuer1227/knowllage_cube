import { computed, onMounted, ref, watch } from "vue";
import FaIcon from "../components/FaIcon.vue";
import GuestDocPreview from "../components/GuestDocPreview.vue";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../stores/workspace";
const workspace = useWorkspaceStore();
const search = ref("");
const sidebarCollapsed = ref(false);
const exportBusy = ref(false);
const exportError = ref("");
const activeBusinessPath = ref([]);
const activeLegalLevel = ref("");
const expandedBusinessKeys = ref([]);
const legalTabs = computed(() => workspace.documentTaxonomy.legalLevels.map((item) => item.name));
const businessRoots = computed(() => workspace.documentTaxonomy.businessDomains);
const documentTotal = computed(() => workspace.docs.length);
function docMatchesKeyword(doc) {
    const keyword = search.value.trim().toLowerCase();
    return (!keyword ||
        doc.title.toLowerCase().includes(keyword) ||
        doc.businessPath.join("/").toLowerCase().includes(keyword) ||
        doc.legalPath.join("/").toLowerCase().includes(keyword) ||
        doc.archivePath.toLowerCase().includes(keyword));
}
const filteredDocs = computed(() => {
    return workspace.docs.filter((doc) => {
        const matchesLegal = !activeLegalLevel.value || doc.legalPath[0] === activeLegalLevel.value;
        const matchesBusiness = activeBusinessPath.value.length === 0 ||
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
function makeBusinessKey(path) {
    return path.join("/");
}
function countDocsForBusiness(path) {
    return workspace.docs.filter((doc) => {
        const matchesPath = path.every((segment, index) => doc.businessPath[index] === segment);
        const matchesLegal = !activeLegalLevel.value || doc.legalPath[0] === activeLegalLevel.value;
        return matchesPath && matchesLegal && docMatchesKeyword(doc);
    }).length;
}
function countDocsForLegal(level) {
    return workspace.docs.filter((doc) => {
        const matchesLegal = doc.legalPath[0] === level;
        const matchesBusiness = activeBusinessPath.value.length === 0 ||
            activeBusinessPath.value.every((segment, index) => doc.businessPath[index] === segment);
        return matchesLegal && matchesBusiness && docMatchesKeyword(doc);
    }).length;
}
function countDocsForAllLegal() {
    return workspace.docs.filter((doc) => {
        const matchesBusiness = activeBusinessPath.value.length === 0 ||
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
function isBusinessPathActive(path) {
    return path.length === activeBusinessPath.value.length && path.every((segment, index) => activeBusinessPath.value[index] === segment);
}
function isBusinessExpanded(path) {
    return expandedBusinessKeys.value.includes(makeBusinessKey(path));
}
function toggleBusinessExpanded(path) {
    const key = makeBusinessKey(path);
    if (isBusinessExpanded(path)) {
        expandedBusinessKeys.value = expandedBusinessKeys.value.filter((item) => item !== key);
        return;
    }
    expandedBusinessKeys.value = [...expandedBusinessKeys.value, key];
}
function selectBusinessPath(path) {
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
function setLegalLevel(level) {
    activeLegalLevel.value = level;
}
function formatDate(value) {
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
function summarizePath(path) {
    return path.join(" / ") || "未设置";
}
async function selectDocument(doc) {
    workspace.setActive(doc.id);
    try {
        await workspace.loadDocumentDetail(doc.id);
    }
    catch (error) {
        exportError.value = error instanceof Error ? error.message : "加载文档失败";
    }
}
watch(businessRoots, (nodes) => {
    const nextKeys = [];
    const walk = (items, parent = []) => {
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
}, { immediate: true });
watch(filteredDocs, (docs) => {
    const current = workspace.activeDocument;
    if (docs.length === 0) {
        return;
    }
    if (!current || !/^\d+$/.test(current.id) || !docs.some((doc) => doc.id === current.id)) {
        void selectDocument(docs[0]);
    }
}, { immediate: true });
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
    }
    catch (error) {
        exportError.value = error instanceof Error ? error.message : "导出失败";
    }
    finally {
        exportBusy.value = false;
    }
}
function businessNodeHasMatches(path) {
    return workspace.docs.some((doc) => {
        const matchesPath = path.every((segment, index) => doc.businessPath[index] === segment);
        const matchesLegal = !activeLegalLevel.value || doc.legalPath[0] === activeLegalLevel.value;
        return matchesPath && matchesLegal && docMatchesKeyword(doc);
    });
}
function isDocumentActive(doc) {
    return activeFilteredDocument.value?.id === doc.id;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-title']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-title']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-search']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-search']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-action']} */ ;
/** @type {__VLS_StyleScopedClasses['legal-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['legal-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['legal-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['legal-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['content-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-card']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['collapsed-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['all-business-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['all-business-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-node']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-node']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-node']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-node']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['result-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['results-list']} */ ;
/** @type {__VLS_StyleScopedClasses['result-item']} */ ;
/** @type {__VLS_StyleScopedClasses['result-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['result-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['result-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['result-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['result-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['result-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['result-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['business-panel-collapsed']} */ ;
/** @type {__VLS_StyleScopedClasses['collapsed-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['content-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['collapsed']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['content-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['collapsed']} */ ;
/** @type {__VLS_StyleScopedClasses['content-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['business-panel-collapsed']} */ ;
/** @type {__VLS_StyleScopedClasses['results-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-panel']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "guest-shell" },
    ...{ class: ({ collapsed: __VLS_ctx.sidebarCollapsed }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "filter-bar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "filter-bar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "filter-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
/** @type {[typeof FaIcon, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "books",
    fixedWidth: true,
}));
const __VLS_1 = __VLS_0({
    name: "books",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.documentTotal);
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "hero-search compact-search" },
});
/** @type {[typeof FaIcon, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "magnifying-glass",
    fixedWidth: true,
}));
const __VLS_4 = __VLS_3({
    name: "magnifying-glass",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    value: (__VLS_ctx.search),
    type: "text",
    placeholder: "搜索标题、业务领域、效力层级...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "legal-nav" },
    'aria-label': "效力层级筛选",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.setLegalLevel('');
        } },
    type: "button",
    ...{ class: "legal-pill" },
    ...{ class: ({ active: !__VLS_ctx.activeLegalLevel }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.countDocsForAllLegal());
for (const [level] of __VLS_getVForSourceType((__VLS_ctx.legalTabs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.setLegalLevel(level);
            } },
        key: (level),
        type: "button",
        ...{ class: "legal-pill" },
        ...{ class: ({ active: __VLS_ctx.activeLegalLevel === level }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (level);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.countDocsForLegal(level));
}
if (__VLS_ctx.activeFilteredDocument) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.exportCurrentDocument) },
        type: "button",
        ...{ class: "hero-action compact-action" },
        disabled: (__VLS_ctx.exportBusy),
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "file-arrow-down",
        fixedWidth: true,
    }));
    const __VLS_7 = __VLS_6({
        name: "file-arrow-down",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.exportBusy ? "导出中..." : "导出文档");
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "content-grid" },
});
if (!__VLS_ctx.sidebarCollapsed) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "business-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-card taxonomy-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "panel-eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "folder-tree",
        fixedWidth: true,
    }));
    const __VLS_10 = __VLS_9({
        name: "folder-tree",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.sidebarCollapsed))
                    return;
                __VLS_ctx.sidebarCollapsed = true;
            } },
        type: "button",
        ...{ class: "icon-btn" },
        'aria-label': "收起筛选栏",
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "angles-left",
        fixedWidth: true,
    }));
    const __VLS_13 = __VLS_12({
        name: "angles-left",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearBusinessPath) },
        type: "button",
        ...{ class: "all-business-btn" },
        ...{ class: ({ active: __VLS_ctx.activeBusinessPath.length === 0 }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "all-business-label" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "layer-group",
        fixedWidth: true,
    }));
    const __VLS_16 = __VLS_15({
        name: "layer-group",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.countDocsForAllBusiness());
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "taxonomy-tree" },
    });
    for (const [node] of __VLS_getVForSourceType((__VLS_ctx.businessRoots))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "taxonomy-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "taxonomy-node" },
            ...{ class: ({ active: __VLS_ctx.isBusinessPathActive([node.name]), muted: !__VLS_ctx.businessNodeHasMatches([node.name]) }) },
        });
        if (node.children.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.sidebarCollapsed))
                            return;
                        if (!(node.children.length))
                            return;
                        __VLS_ctx.toggleBusinessExpanded([node.name]);
                    } },
                type: "button",
                ...{ class: "toggle-btn" },
            });
            /** @type {[typeof FaIcon, ]} */ ;
            // @ts-ignore
            const __VLS_18 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
                name: (__VLS_ctx.isBusinessExpanded([node.name]) ? 'minus' : 'plus'),
                fixedWidth: true,
            }));
            const __VLS_19 = __VLS_18({
                name: (__VLS_ctx.isBusinessExpanded([node.name]) ? 'minus' : 'plus'),
                fixedWidth: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "toggle-placeholder" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.sidebarCollapsed))
                        return;
                    __VLS_ctx.selectBusinessPath([node.name]);
                } },
            type: "button",
            ...{ class: "node-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (node.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.countDocsForBusiness([node.name]));
        if (node.children.length && __VLS_ctx.isBusinessExpanded([node.name])) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "taxonomy-children" },
            });
            for (const [child] of __VLS_getVForSourceType((node.children))) {
                (`${node.name}/${child.name}`);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "taxonomy-node child" },
                    ...{ class: ({
                            active: __VLS_ctx.isBusinessPathActive([node.name, child.name]),
                            muted: !__VLS_ctx.businessNodeHasMatches([node.name, child.name])
                        }) },
                });
                if (child.children.length) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(!__VLS_ctx.sidebarCollapsed))
                                    return;
                                if (!(node.children.length && __VLS_ctx.isBusinessExpanded([node.name])))
                                    return;
                                if (!(child.children.length))
                                    return;
                                __VLS_ctx.toggleBusinessExpanded([node.name, child.name]);
                            } },
                        type: "button",
                        ...{ class: "toggle-btn" },
                    });
                    /** @type {[typeof FaIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_21 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
                        name: (__VLS_ctx.isBusinessExpanded([node.name, child.name]) ? 'minus' : 'plus'),
                        fixedWidth: true,
                    }));
                    const __VLS_22 = __VLS_21({
                        name: (__VLS_ctx.isBusinessExpanded([node.name, child.name]) ? 'minus' : 'plus'),
                        fixedWidth: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "toggle-placeholder" },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(!__VLS_ctx.sidebarCollapsed))
                                return;
                            if (!(node.children.length && __VLS_ctx.isBusinessExpanded([node.name])))
                                return;
                            __VLS_ctx.selectBusinessPath([node.name, child.name]);
                        } },
                    type: "button",
                    ...{ class: "node-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (child.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (__VLS_ctx.countDocsForBusiness([node.name, child.name]));
                for (const [grandchild] of __VLS_getVForSourceType((child.children))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (`${node.name}/${child.name}/${grandchild.name}`),
                        ...{ class: "taxonomy-node grandchild" },
                        ...{ class: ({
                                active: __VLS_ctx.isBusinessPathActive([node.name, child.name, grandchild.name]),
                                muted: !__VLS_ctx.businessNodeHasMatches([node.name, child.name, grandchild.name])
                            }) },
                    });
                    __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isBusinessExpanded([node.name, child.name])) }, null, null);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "toggle-placeholder" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(!__VLS_ctx.sidebarCollapsed))
                                    return;
                                if (!(node.children.length && __VLS_ctx.isBusinessExpanded([node.name])))
                                    return;
                                __VLS_ctx.selectBusinessPath([node.name, child.name, grandchild.name]);
                            } },
                        type: "button",
                        ...{ class: "node-label" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (grandchild.name);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (__VLS_ctx.countDocsForBusiness([node.name, child.name, grandchild.name]));
                }
            }
        }
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "business-panel-collapsed" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.sidebarCollapsed))
                    return;
                __VLS_ctx.sidebarCollapsed = false;
            } },
        type: "button",
        ...{ class: "collapsed-btn" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "angles-right",
        fixedWidth: true,
    }));
    const __VLS_25 = __VLS_24({
        name: "angles-right",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "results-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-card results-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "panel-eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
/** @type {[typeof FaIcon, ]} */ ;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "list-ul",
    fixedWidth: true,
}));
const __VLS_28 = __VLS_27({
    name: "list-ul",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_27));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.activeLegalSummary);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "result-badge" },
});
(__VLS_ctx.filteredDocs.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "filter-summary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "summary-chip" },
});
/** @type {[typeof FaIcon, ]} */ ;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "scale-balanced",
    fixedWidth: true,
}));
const __VLS_31 = __VLS_30({
    name: "scale-balanced",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.activeLegalSummary);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "summary-chip" },
});
/** @type {[typeof FaIcon, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "folder-tree",
    fixedWidth: true,
}));
const __VLS_34 = __VLS_33({
    name: "folder-tree",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.activeBusinessSummary);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "results-list" },
});
for (const [doc] of __VLS_getVForSourceType((__VLS_ctx.filteredDocs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectDocument(doc);
            } },
        key: (doc.id),
        type: "button",
        ...{ class: "result-item" },
        ...{ class: ({ active: __VLS_ctx.isDocumentActive(doc) }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "result-icon" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "file-lines",
        fixedWidth: true,
    }));
    const __VLS_37 = __VLS_36({
        name: "file-lines",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "result-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (doc.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.summarizePath(doc.legalPath));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.summarizePath(doc.businessPath));
}
if (__VLS_ctx.filteredDocs.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-state" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_39 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "inbox",
        fixedWidth: true,
    }));
    const __VLS_40 = __VLS_39({
        name: "inbox",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_39));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "preview-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-card preview-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-header preview-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "panel-eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
/** @type {[typeof FaIcon, ]} */ ;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
    name: "file-lines",
    fixedWidth: true,
}));
const __VLS_43 = __VLS_42({
    name: "file-lines",
    fixedWidth: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.activeFilteredDocument?.title || "未选择文档");
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "preview-meta" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.activeResultMeta))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        key: (item),
    });
    (item);
}
if (__VLS_ctx.exportError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "error-banner" },
    });
    (__VLS_ctx.exportError);
}
if (__VLS_ctx.activeFilteredDocument) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "preview-body" },
    });
    if (__VLS_ctx.workspace.activeDocumentLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-loading" },
        });
        /** @type {[typeof FaIcon, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
            name: "spinner",
            fixedWidth: true,
            ...{ class: "spin" },
        }));
        const __VLS_46 = __VLS_45({
            name: "spinner",
            fixedWidth: true,
            ...{ class: "spin" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    /** @type {[typeof GuestDocPreview, ]} */ ;
    // @ts-ignore
    const __VLS_48 = __VLS_asFunctionalComponent(GuestDocPreview, new GuestDocPreview({
        source: (__VLS_ctx.activeFilteredDocument.markdownSource ?? ''),
        persistedHtml: (__VLS_ctx.activeFilteredDocument.previewHtml),
    }));
    const __VLS_49 = __VLS_48({
        source: (__VLS_ctx.activeFilteredDocument.markdownSource ?? ''),
        persistedHtml: (__VLS_ctx.activeFilteredDocument.previewHtml),
    }, ...__VLS_functionalComponentArgsRest(__VLS_48));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-preview" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_51 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: "file-circle-xmark",
        fixedWidth: true,
    }));
    const __VLS_52 = __VLS_51({
        name: "file-circle-xmark",
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_51));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
/** @type {__VLS_StyleScopedClasses['guest-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-title']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-search']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-search']} */ ;
/** @type {__VLS_StyleScopedClasses['legal-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['legal-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['legal-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-action']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-action']} */ ;
/** @type {__VLS_StyleScopedClasses['content-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['business-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-card']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['all-business-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['all-business-label']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-tree']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-group']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-node']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-children']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-node']} */ ;
/** @type {__VLS_StyleScopedClasses['child']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['taxonomy-node']} */ ;
/** @type {__VLS_StyleScopedClasses['grandchild']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['business-panel-collapsed']} */ ;
/** @type {__VLS_StyleScopedClasses['collapsed-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['results-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-card']} */ ;
/** @type {__VLS_StyleScopedClasses['results-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['result-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['results-list']} */ ;
/** @type {__VLS_StyleScopedClasses['result-item']} */ ;
/** @type {__VLS_StyleScopedClasses['result-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['result-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-card']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['error-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['spin']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-preview']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FaIcon: FaIcon,
            GuestDocPreview: GuestDocPreview,
            workspace: workspace,
            search: search,
            sidebarCollapsed: sidebarCollapsed,
            exportBusy: exportBusy,
            exportError: exportError,
            activeBusinessPath: activeBusinessPath,
            activeLegalLevel: activeLegalLevel,
            legalTabs: legalTabs,
            businessRoots: businessRoots,
            documentTotal: documentTotal,
            filteredDocs: filteredDocs,
            activeFilteredDocument: activeFilteredDocument,
            activeBusinessSummary: activeBusinessSummary,
            activeLegalSummary: activeLegalSummary,
            activeResultMeta: activeResultMeta,
            countDocsForBusiness: countDocsForBusiness,
            countDocsForLegal: countDocsForLegal,
            countDocsForAllLegal: countDocsForAllLegal,
            countDocsForAllBusiness: countDocsForAllBusiness,
            isBusinessPathActive: isBusinessPathActive,
            isBusinessExpanded: isBusinessExpanded,
            toggleBusinessExpanded: toggleBusinessExpanded,
            selectBusinessPath: selectBusinessPath,
            clearBusinessPath: clearBusinessPath,
            setLegalLevel: setLegalLevel,
            summarizePath: summarizePath,
            selectDocument: selectDocument,
            exportCurrentDocument: exportCurrentDocument,
            businessNodeHasMatches: businessNodeHasMatches,
            isDocumentActive: isDocumentActive,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
