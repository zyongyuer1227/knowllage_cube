import { computed, ref } from "vue";
import FaIcon from "./FaIcon.vue";
const props = defineProps();
const emit = defineEmits();
const keyword = computed(() => props.search?.trim().toLowerCase() ?? "");
const depth = computed(() => props.baseDepth ?? 0);
const dragTargetKey = ref("");
function matchesDocument(doc) {
    if (!keyword.value)
        return true;
    const haystack = `${doc.title} ${doc.archivePath}`.toLowerCase();
    return haystack.includes(keyword.value);
}
function filterNode(node) {
    const filteredChildren = node.children
        .map((child) => filterNode(child))
        .filter((child) => Boolean(child));
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
const visibleNodes = computed(() => props.nodes.map((node) => filterNode(node)).filter((node) => Boolean(node)));
function isOpen(key) {
    return props.openKeys.includes(key);
}
function isSelected(id) {
    return (props.selectedIds ?? []).includes(id);
}
function handleDragStart(event, doc) {
    event.dataTransfer?.setData("text/plain", doc.id);
    event.dataTransfer?.setData("application/x-knowledge-doc-id", doc.id);
    event.dataTransfer?.setData("application/x-knowledge-doc-title", doc.title);
    event.dataTransfer?.setData("application/x-knowledge-doc-path", doc.archivePath);
    event.dataTransfer?.setData("application/x-knowledge-doc-json", JSON.stringify(doc));
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
    }
}
function setDragTarget(key) {
    dragTargetKey.value = key;
}
function clearDragTarget() {
    dragTargetKey.value = "";
}
function isDragTarget(key) {
    return dragTargetKey.value === key;
}
function handleFolderDragEnter(node) {
    setDragTarget(`folder:${node.fullPath}`);
    if (!isOpen(node.key)) {
        emit("toggle", node.key);
    }
}
function handleDrop(event, targetPath) {
    event.preventDefault();
    event.stopPropagation();
    const payload = event.dataTransfer?.getData("application/x-knowledge-doc-json");
    clearDragTarget();
    if (!payload) {
        const docId = event.dataTransfer?.getData("application/x-knowledge-doc-id") || event.dataTransfer?.getData("text/plain");
        if (!docId)
            return;
        const doc = {
            id: docId,
            title: event.dataTransfer?.getData("application/x-knowledge-doc-title") || "",
            archivePath: event.dataTransfer?.getData("application/x-knowledge-doc-path") || "",
            markdownSource: ""
        };
        emit("move", { doc, targetPath });
        return;
    }
    const doc = JSON.parse(payload);
    emit("move", { doc, targetPath });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['folder-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['file-row']} */ ;
/** @type {__VLS_StyleScopedClasses['drop-target']} */ ;
/** @type {__VLS_StyleScopedClasses['file-row']} */ ;
/** @type {__VLS_StyleScopedClasses['file-row']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['select-action']} */ ;
/** @type {__VLS_StyleScopedClasses['select-action']} */ ;
/** @type {__VLS_StyleScopedClasses['select-action']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-action']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-action']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-action']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-sign']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['file-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['select-action']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-action']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tree-list" },
});
for (const [node] of __VLS_getVForSourceType((__VLS_ctx.visibleNodes))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        key: (node.key),
        ...{ class: "folder-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.emit('select-folder', node.fullPath);
                __VLS_ctx.emit('toggle', node.key);
                ;
            } },
        ...{ onDragenter: (...[$event]) => {
                __VLS_ctx.handleFolderDragEnter(node);
            } },
        ...{ onDragover: (...[$event]) => {
                __VLS_ctx.setDragTarget(`folder:${node.fullPath}`);
                $event.dataTransfer && ($event.dataTransfer.dropEffect = 'move');
                ;
            } },
        ...{ onDragleave: (__VLS_ctx.clearDragTarget) },
        ...{ onDrop: (...[$event]) => {
                __VLS_ctx.handleDrop($event, node.fullPath);
            } },
        type: "button",
        ...{ class: "folder-toggle" },
        ...{ class: ({ active: node.fullPath === __VLS_ctx.activeFolderPath, 'drop-target': __VLS_ctx.isDragTarget(`folder:${node.fullPath}`) }) },
        ...{ style: ({ paddingLeft: `${8 + __VLS_ctx.depth * 18}px` }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "folder-sign" },
    });
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: (__VLS_ctx.isOpen(node.key) ? 'square-minus' : 'square-plus'),
        fixedWidth: true,
    }));
    const __VLS_1 = __VLS_0({
        name: (__VLS_ctx.isOpen(node.key) ? 'square-minus' : 'square-plus'),
        fixedWidth: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    /** @type {[typeof FaIcon, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
        name: (__VLS_ctx.isOpen(node.key) ? 'folder-open' : 'folder'),
        fixedWidth: true,
        ...{ class: "folder-icon" },
    }));
    const __VLS_4 = __VLS_3({
        name: (__VLS_ctx.isOpen(node.key) ? 'folder-open' : 'folder'),
        fixedWidth: true,
        ...{ class: "folder-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "folder-title" },
    });
    (node.name);
    if (__VLS_ctx.isDragTarget(`folder:${node.fullPath}`)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "drop-hint" },
        });
    }
    if (__VLS_ctx.isOpen(node.key)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "folder-children" },
        });
        if (node.children.length > 0) {
            const __VLS_6 = {}.WorkspaceTree;
            /** @type {[typeof __VLS_components.WorkspaceTree, ]} */ ;
            // @ts-ignore
            const __VLS_7 = __VLS_asFunctionalComponent(__VLS_6, new __VLS_6({
                ...{ 'onToggle': {} },
                ...{ 'onSelectFolder': {} },
                ...{ 'onSelect': {} },
                ...{ 'onDelete': {} },
                ...{ 'onToggleSelect': {} },
                ...{ 'onMove': {} },
                nodes: (node.children),
                activeId: (__VLS_ctx.activeId),
                search: (__VLS_ctx.search),
                openKeys: (__VLS_ctx.openKeys),
                baseDepth: (__VLS_ctx.depth + 1),
                canDelete: (__VLS_ctx.canDelete),
                activeFolderPath: (__VLS_ctx.activeFolderPath),
                selectedIds: (__VLS_ctx.selectedIds),
            }));
            const __VLS_8 = __VLS_7({
                ...{ 'onToggle': {} },
                ...{ 'onSelectFolder': {} },
                ...{ 'onSelect': {} },
                ...{ 'onDelete': {} },
                ...{ 'onToggleSelect': {} },
                ...{ 'onMove': {} },
                nodes: (node.children),
                activeId: (__VLS_ctx.activeId),
                search: (__VLS_ctx.search),
                openKeys: (__VLS_ctx.openKeys),
                baseDepth: (__VLS_ctx.depth + 1),
                canDelete: (__VLS_ctx.canDelete),
                activeFolderPath: (__VLS_ctx.activeFolderPath),
                selectedIds: (__VLS_ctx.selectedIds),
            }, ...__VLS_functionalComponentArgsRest(__VLS_7));
            let __VLS_10;
            let __VLS_11;
            let __VLS_12;
            const __VLS_13 = {
                onToggle: (...[$event]) => {
                    if (!(__VLS_ctx.isOpen(node.key)))
                        return;
                    if (!(node.children.length > 0))
                        return;
                    __VLS_ctx.emit('toggle', $event);
                }
            };
            const __VLS_14 = {
                onSelectFolder: (...[$event]) => {
                    if (!(__VLS_ctx.isOpen(node.key)))
                        return;
                    if (!(node.children.length > 0))
                        return;
                    __VLS_ctx.emit('select-folder', $event);
                }
            };
            const __VLS_15 = {
                onSelect: (...[$event]) => {
                    if (!(__VLS_ctx.isOpen(node.key)))
                        return;
                    if (!(node.children.length > 0))
                        return;
                    __VLS_ctx.emit('select', $event);
                }
            };
            const __VLS_16 = {
                onDelete: (...[$event]) => {
                    if (!(__VLS_ctx.isOpen(node.key)))
                        return;
                    if (!(node.children.length > 0))
                        return;
                    __VLS_ctx.emit('delete', $event);
                }
            };
            const __VLS_17 = {
                onToggleSelect: (...[$event]) => {
                    if (!(__VLS_ctx.isOpen(node.key)))
                        return;
                    if (!(node.children.length > 0))
                        return;
                    __VLS_ctx.emit('toggle-select', $event);
                }
            };
            const __VLS_18 = {
                onMove: (...[$event]) => {
                    if (!(__VLS_ctx.isOpen(node.key)))
                        return;
                    if (!(node.children.length > 0))
                        return;
                    __VLS_ctx.emit('move', $event);
                }
            };
            var __VLS_9;
        }
        if (node.documents.length > 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "folder-files" },
            });
            for (const [doc] of __VLS_getVForSourceType((node.documents))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ onDragenter: (...[$event]) => {
                            if (!(__VLS_ctx.isOpen(node.key)))
                                return;
                            if (!(node.documents.length > 0))
                                return;
                            __VLS_ctx.setDragTarget(`doc:${doc.id}`);
                        } },
                    ...{ onDragover: (...[$event]) => {
                            if (!(__VLS_ctx.isOpen(node.key)))
                                return;
                            if (!(node.documents.length > 0))
                                return;
                            __VLS_ctx.setDragTarget(`doc:${doc.id}`);
                            $event.dataTransfer && ($event.dataTransfer.dropEffect = 'move');
                            ;
                        } },
                    ...{ onDragleave: (__VLS_ctx.clearDragTarget) },
                    ...{ onDrop: (...[$event]) => {
                            if (!(__VLS_ctx.isOpen(node.key)))
                                return;
                            if (!(node.documents.length > 0))
                                return;
                            __VLS_ctx.handleDrop($event, node.fullPath);
                        } },
                    key: (doc.id),
                    ...{ class: "file-row" },
                    ...{ class: ({ active: doc.id === __VLS_ctx.activeId, 'drop-target': __VLS_ctx.isDragTarget(`doc:${doc.id}`) }) },
                    ...{ style: ({ paddingLeft: `${44 + __VLS_ctx.depth * 18}px` }) },
                });
                if (__VLS_ctx.canDelete) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.isOpen(node.key)))
                                    return;
                                if (!(node.documents.length > 0))
                                    return;
                                if (!(__VLS_ctx.canDelete))
                                    return;
                                __VLS_ctx.emit('toggle-select', doc);
                            } },
                        type: "button",
                        ...{ class: "select-action" },
                        ...{ class: ({ selected: __VLS_ctx.isSelected(doc.id) }) },
                        title: (__VLS_ctx.isSelected(doc.id) ? '取消选择' : '选择文档'),
                        'aria-label': (__VLS_ctx.isSelected(doc.id) ? '取消选择文档' : '选择文档'),
                    });
                    /** @type {[typeof FaIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_19 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
                        name: (__VLS_ctx.isSelected(doc.id) ? 'square-check' : 'square'),
                        fixedWidth: true,
                    }));
                    const __VLS_20 = __VLS_19({
                        name: (__VLS_ctx.isSelected(doc.id) ? 'square-check' : 'square'),
                        fixedWidth: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.isOpen(node.key)))
                                return;
                            if (!(node.documents.length > 0))
                                return;
                            __VLS_ctx.emit('select', doc);
                        } },
                    ...{ onDragstart: (...[$event]) => {
                            if (!(__VLS_ctx.isOpen(node.key)))
                                return;
                            if (!(node.documents.length > 0))
                                return;
                            __VLS_ctx.handleDragStart($event, doc);
                        } },
                    ...{ onDragend: (__VLS_ctx.clearDragTarget) },
                    type: "button",
                    ...{ class: "file-item" },
                    draggable: "true",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "file-icon" },
                });
                /** @type {[typeof FaIcon, ]} */ ;
                // @ts-ignore
                const __VLS_22 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
                    name: "file-lines",
                    fixedWidth: true,
                }));
                const __VLS_23 = __VLS_22({
                    name: "file-lines",
                    fixedWidth: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_22));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "file-title" },
                });
                (doc.title);
                if (__VLS_ctx.isDragTarget(`doc:${doc.id}`)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "drop-hint inline-hint" },
                    });
                }
                if (__VLS_ctx.canDelete) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.isOpen(node.key)))
                                    return;
                                if (!(node.documents.length > 0))
                                    return;
                                if (!(__VLS_ctx.canDelete))
                                    return;
                                __VLS_ctx.emit('delete', doc);
                            } },
                        type: "button",
                        ...{ class: "doc-action" },
                        title: "删除文档",
                        'aria-label': "删除文档",
                    });
                    /** @type {[typeof FaIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_25 = __VLS_asFunctionalComponent(FaIcon, new FaIcon({
                        name: "trash-can",
                        fixedWidth: true,
                    }));
                    const __VLS_26 = __VLS_25({
                        name: "trash-can",
                        fixedWidth: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                }
            }
        }
    }
}
/** @type {__VLS_StyleScopedClasses['tree-list']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-block']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-sign']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-title']} */ ;
/** @type {__VLS_StyleScopedClasses['drop-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-children']} */ ;
/** @type {__VLS_StyleScopedClasses['folder-files']} */ ;
/** @type {__VLS_StyleScopedClasses['file-row']} */ ;
/** @type {__VLS_StyleScopedClasses['select-action']} */ ;
/** @type {__VLS_StyleScopedClasses['file-item']} */ ;
/** @type {__VLS_StyleScopedClasses['file-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['file-title']} */ ;
/** @type {__VLS_StyleScopedClasses['drop-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-action']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FaIcon: FaIcon,
            emit: emit,
            depth: depth,
            visibleNodes: visibleNodes,
            isOpen: isOpen,
            isSelected: isSelected,
            handleDragStart: handleDragStart,
            setDragTarget: setDragTarget,
            clearDragTarget: clearDragTarget,
            isDragTarget: isDragTarget,
            handleFolderDragEnter: handleFolderDragEnter,
            handleDrop: handleDrop,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
