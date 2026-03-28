import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../lib/api";
function buildDemoDocs() {
    return [
        {
            id: "welcome",
            title: "欢迎.md",
            archivePath: "最近文档",
            markdownSource: `# 欢迎\n\n这里是前台阅读视图。`
        },
        {
            id: "quick-start",
            title: "快速开始.md",
            archivePath: "最近文档",
            markdownSource: `# 快速开始\n\n1. 左侧选择文档\n2. 前台阅读渲染结果\n3. 后台编辑 Markdown 源码`
        },
        {
            id: "workspace-guide",
            title: "工作区说明.md",
            archivePath: "最近文档",
            markdownSource: `# 工作区说明\n\n- 左侧：文档树\n- 右侧：阅读区或源码区\n- 顶部：全局操作`
        }
    ];
}
function buildDemoFolders() {
    return [
        { id: "demo-recent", name: "最近文档", fullPath: "最近文档", parentPath: null }
    ];
}
function getDefaultDocument() {
    return buildDemoDocs()[0];
}
function normalizeFolder(value) {
    return value
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join("/");
}
function getTreePath(value) {
    const normalized = normalizeFolder(value);
    return normalized || "未归档";
}
function toArchivePath(value) {
    const normalized = normalizeFolder(value);
    return normalized === "未归档" ? "" : normalized;
}
function isPersistedDocumentId(value) {
    return /^\d+$/.test(value);
}
function ensureFolderPathSet(paths, path) {
    const normalized = normalizeFolder(path);
    if (!normalized)
        return;
    const segments = normalized.split("/");
    for (let i = 0; i < segments.length; i += 1) {
        paths.add(segments.slice(0, i + 1).join("/"));
    }
}
export const useWorkspaceStore = defineStore("workspace", () => {
    const docs = ref([]);
    const folders = ref([]);
    const activeId = ref("");
    const mode = ref("public");
    const defaultDocument = ref(getDefaultDocument());
    const hasUserSelectedDocument = ref(false);
    const loading = ref(false);
    const saving = ref(false);
    const initialized = ref(false);
    const usingAdminData = ref(false);
    const selectedFolderPath = ref("未归档");
    const editorTitle = ref("");
    const editorArchivePath = ref("");
    const editorMarkdown = ref("");
    const activeDocument = computed(() => {
        if (!hasUserSelectedDocument.value) {
            return defaultDocument.value;
        }
        return docs.value.find((doc) => doc.id === activeId.value) ?? docs.value[0] ?? defaultDocument.value;
    });
    const tree = computed(() => {
        const folderPathSet = new Set();
        folders.value.forEach((folder) => ensureFolderPathSet(folderPathSet, folder.fullPath));
        docs.value.forEach((doc) => ensureFolderPathSet(folderPathSet, getTreePath(doc.archivePath)));
        const nodeMap = new Map();
        const getNode = (fullPath) => {
            if (!nodeMap.has(fullPath)) {
                nodeMap.set(fullPath, {
                    key: fullPath,
                    name: fullPath.split("/").slice(-1)[0] ?? fullPath,
                    fullPath,
                    children: [],
                    documents: []
                });
            }
            return nodeMap.get(fullPath);
        };
        Array.from(folderPathSet)
            .sort((a, b) => a.localeCompare(b, "zh-CN"))
            .forEach((fullPath) => {
            const node = getNode(fullPath);
            const parentPath = fullPath.includes("/") ? fullPath.split("/").slice(0, -1).join("/") : "";
            if (parentPath) {
                const parent = getNode(parentPath);
                if (!parent.children.some((child) => child.fullPath === node.fullPath)) {
                    parent.children.push(node);
                }
            }
        });
        docs.value.forEach((doc) => {
            const normalizedPath = getTreePath(doc.archivePath);
            getNode(normalizedPath).documents.push(doc);
        });
        const sortNode = (node) => {
            node.children.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
            node.documents.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
            node.children.forEach(sortNode);
        };
        const roots = Array.from(nodeMap.values()).filter((node) => !node.fullPath.includes("/"));
        roots.forEach(sortNode);
        return roots.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    });
    function syncEditorFromActive() {
        if (!activeDocument.value) {
            editorTitle.value = "";
            editorArchivePath.value = "";
            editorMarkdown.value = "";
            return;
        }
        editorTitle.value = activeDocument.value.title;
        editorArchivePath.value = activeDocument.value.archivePath;
        editorMarkdown.value = activeDocument.value.markdownSource;
        selectedFolderPath.value = getTreePath(activeDocument.value.archivePath);
    }
    function ensureInitialized() {
        if (initialized.value)
            return;
        docs.value = [];
        folders.value = [];
        activeId.value = "";
        hasUserSelectedDocument.value = false;
        defaultDocument.value = getDefaultDocument();
        syncEditorFromActive();
        initialized.value = true;
        usingAdminData.value = false;
    }
    function setActive(id) {
        activeId.value = id;
        hasUserSelectedDocument.value = true;
        syncEditorFromActive();
    }
    function setSelectedFolder(path) {
        selectedFolderPath.value = getTreePath(path);
    }
    async function loadPublicWorkspace() {
        ensureInitialized();
        mode.value = "public";
        loading.value = true;
        try {
            const [searchResult, folderResult, welcome] = await Promise.all([
                api.publicSearch({
                    page: 1,
                    pageSize: 100,
                    sortBy: "updatedAt",
                    order: "desc"
                }),
                api.publicFolders(),
                api.getPublicWelcomeDocument()
            ]);
            const details = await Promise.all(searchResult.items.map(async (item) => {
                const doc = await api.publicDocument(String(item.id));
                return {
                    id: String(doc.id),
                    title: String(doc.title ?? ""),
                    archivePath: String(doc.archivePath ?? item.archivePath ?? ""),
                    markdownSource: String(doc.markdownContent ?? ""),
                    rawText: doc.rawText ? String(doc.rawText) : undefined,
                    previewHtml: doc.previewHtml ? String(doc.previewHtml) : undefined,
                    updatedAt: String(doc.updatedAt ?? item.updatedAt ?? "")
                };
            }));
            docs.value = details;
            defaultDocument.value = {
                id: "welcome",
                title: String(welcome.title ?? "欢迎.md"),
                archivePath: "",
                markdownSource: String(welcome.markdownContent ?? ""),
                previewHtml: String(welcome.previewHtml ?? "")
            };
            folders.value = folderResult.items.map((item) => ({
                id: String(item.id),
                name: String(item.name),
                fullPath: String(item.fullPath),
                parentPath: item.parentPath ? String(item.parentPath) : null
            }));
            if (!details.some((doc) => doc.id === activeId.value)) {
                activeId.value = "";
                hasUserSelectedDocument.value = false;
            }
            syncEditorFromActive();
            usingAdminData.value = false;
        }
        finally {
            loading.value = false;
        }
    }
    async function loadAdminWorkspace(token) {
        ensureInitialized();
        mode.value = "admin";
        loading.value = true;
        try {
            const [searchResult, folderResult, welcome] = await Promise.all([
                api.publicSearch({
                    page: 1,
                    pageSize: 100,
                    sortBy: "updatedAt",
                    order: "desc"
                }),
                api.listFolders(token),
                api.getAdminWelcomeDocument(token)
            ]);
            const details = await Promise.all(searchResult.items.map(async (item) => {
                const doc = await api.getDocument(String(item.id), token);
                return {
                    id: String(doc.id),
                    title: String(doc.title ?? ""),
                    archivePath: String(doc.archivePath ?? ""),
                    markdownSource: String(doc.markdownContent ?? ""),
                    rawText: doc.rawText ? String(doc.rawText) : undefined,
                    previewHtml: doc.previewHtml ? String(doc.previewHtml) : undefined,
                    updatedAt: String(doc.updatedAt ?? "")
                };
            }));
            docs.value = details;
            defaultDocument.value = {
                id: "welcome",
                title: String(welcome.title ?? "欢迎.md"),
                archivePath: "",
                markdownSource: String(welcome.markdownContent ?? ""),
                previewHtml: String(welcome.previewHtml ?? "")
            };
            folders.value = folderResult.items.map((item) => ({
                id: String(item.id),
                name: String(item.name),
                fullPath: String(item.fullPath),
                parentPath: item.parentPath ? String(item.parentPath) : null
            }));
            if (!details.some((doc) => doc.id === activeId.value)) {
                activeId.value = "";
                hasUserSelectedDocument.value = false;
            }
            syncEditorFromActive();
            usingAdminData.value = true;
        }
        finally {
            loading.value = false;
        }
    }
    async function createDocument(token, title) {
        const normalizedTitle = title.trim();
        if (!normalizedTitle)
            return;
        const markdown = `# ${normalizedTitle}\n\n请在后台继续编辑这份 Markdown 源码。\n`;
        const file = new File([markdown], `${normalizedTitle}.txt`, { type: "text/plain" });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", normalizedTitle);
        const targetPath = toArchivePath(selectedFolderPath.value || editorArchivePath.value);
        if (targetPath) {
            formData.append("archivePath", targetPath);
        }
        const result = await api.uploadDocument(formData, token);
        await loadAdminWorkspace(token);
        if (result.documentId) {
            setActive(String(result.documentId));
        }
    }
    async function importFiles(token, files) {
        if (files.length === 0)
            return;
        const formData = new FormData();
        files.forEach((file) => formData.append(files.length > 1 ? "files" : "file", file));
        formData.append("title", files[0].name.replace(/\.[^.]+$/, ""));
        const targetPath = toArchivePath(selectedFolderPath.value || editorArchivePath.value);
        if (targetPath) {
            formData.append("archivePath", targetPath);
        }
        if (files.length > 1) {
            const result = await api.uploadBatch(formData, token);
            const items = Array.isArray(result.items) ? result.items : [];
            return {
                tasks: items
                    .filter((item) => item.success === true && item.taskId && item.documentId)
                    .map((item) => ({
                    documentId: String(item.documentId),
                    taskId: String(item.taskId),
                    fileName: String(item.fileName ?? "")
                }))
            };
        }
        else {
            const result = await api.uploadDocument(formData, token);
            if (!result.documentId || !result.taskId) {
                throw new Error("上传成功但未返回转换任务");
            }
            return {
                tasks: [
                    {
                        documentId: String(result.documentId),
                        taskId: String(result.taskId),
                        fileName: files[0].name
                    }
                ]
            };
        }
    }
    async function waitForImportTasks(token, tasks, onProgress) {
        if (tasks.length === 0) {
            await loadAdminWorkspace(token);
            return {
                completed: [],
                failed: []
            };
        }
        const pending = new Map(tasks.map((task) => [task.taskId, task]));
        const completed = [];
        const failed = [];
        let activeFileName = tasks[0]?.fileName ?? "";
        while (pending.size > 0) {
            const statuses = await Promise.all(Array.from(pending.values()).map(async (task) => ({
                task,
                status: await api.getTask(task.taskId, token)
            })));
            for (const { task, status } of statuses) {
                if (status.status === "success") {
                    pending.delete(task.taskId);
                    completed.push(task);
                    activeFileName = task.fileName;
                    continue;
                }
                if (status.status === "failed") {
                    pending.delete(task.taskId);
                    failed.push({
                        ...task,
                        errorMessage: status.errorMessage
                    });
                    activeFileName = task.fileName;
                }
            }
            onProgress?.({
                total: tasks.length,
                completed: completed.length,
                failed: failed.length,
                activeFileName: pending.values().next().value?.fileName ?? activeFileName
            });
            if (pending.size > 0) {
                await new Promise((resolve) => window.setTimeout(resolve, 1500));
            }
        }
        await loadAdminWorkspace(token);
        const latestCompleted = completed[completed.length - 1];
        if (latestCompleted) {
            setActive(latestCompleted.documentId);
        }
        return {
            completed,
            failed
        };
    }
    async function createFolder(token, folderName) {
        const normalized = normalizeFolder(folderName);
        if (!normalized)
            return;
        await api.createFolder(normalized, token);
        await loadAdminWorkspace(token);
    }
    async function saveActiveDocument(token) {
        if (!activeDocument.value)
            return;
        if (!isPersistedDocumentId(activeDocument.value.id)) {
            if (mode.value !== "admin") {
                throw new Error("当前文档不可保存");
            }
            defaultDocument.value = await api.updateAdminWelcomeDocument({
                title: editorTitle.value.trim() || "欢迎.md",
                markdownContent: editorMarkdown.value,
                changeNote: "Admin fallback welcome document update"
            }, token).then((doc) => ({
                id: "welcome",
                title: String(doc.title ?? "欢迎.md"),
                archivePath: "",
                markdownSource: String(doc.markdownContent ?? ""),
                previewHtml: String(doc.previewHtml ?? "")
            }));
            hasUserSelectedDocument.value = false;
            syncEditorFromActive();
            return;
        }
        saving.value = true;
        try {
            await api.updateDocument(activeDocument.value.id, {
                title: editorTitle.value,
                archivePath: editorArchivePath.value
            }, token);
            await api.updateDocumentContent(activeDocument.value.id, {
                markdownContent: editorMarkdown.value,
                changeNote: "Admin workspace editor update"
            }, token);
            await loadAdminWorkspace(token);
            setActive(activeDocument.value.id);
        }
        finally {
            saving.value = false;
        }
    }
    async function moveDocument(token, documentId, targetPath) {
        await api.updateDocument(documentId, {
            archivePath: toArchivePath(targetPath)
        }, token);
        await loadAdminWorkspace(token);
        const movedDoc = docs.value.find((doc) => doc.id === documentId);
        if (movedDoc) {
            setActive(movedDoc.id);
        }
    }
    async function formatEditorTextWithAi(token, onProgress) {
        const title = editorTitle.value.trim() || activeDocument.value?.title?.replace(/\.md$/i, "") || "未命名文档";
        const text = editorMarkdown.value.trim();
        if (!text) {
            throw new Error("编辑框内容为空");
        }
        onProgress?.({
            stage: "llm",
            percent: 18,
            label: "大模型处理中"
        });
        const result = await api.formatTextImport({
            documentId: isPersistedDocumentId(activeDocument.value?.id ?? "") ? activeDocument.value?.id : undefined,
            title,
            text,
            archivePath: toArchivePath(selectedFolderPath.value || editorArchivePath.value)
        }, token);
        const taskId = String(result.taskId ?? "");
        const documentId = String(result.documentId ?? "");
        if (!documentId) {
            throw new Error("格式化成功但未返回文档信息");
        }
        if (!taskId) {
            onProgress?.({
                stage: "import",
                percent: 100,
                label: "导入处理中"
            });
            await loadAdminWorkspace(token);
            setActive(documentId);
            return documentId;
        }
        onProgress?.({
            stage: "import",
            percent: 55,
            label: "导入处理中"
        });
        const waitResult = await waitForImportTasks(token, [
            {
                documentId,
                taskId,
                fileName: `${title}.txt`
            }
        ], (snapshot) => {
            const ratio = snapshot.total === 0 ? 0 : (snapshot.completed + snapshot.failed) / snapshot.total;
            onProgress?.({
                stage: "import",
                percent: Math.round(55 + ratio * 45),
                label: snapshot.completed + snapshot.failed >= snapshot.total
                    ? "导入处理中"
                    : `导入处理中：${snapshot.activeFileName || `${title}.txt`}`
            });
        });
        if (waitResult.failed.length > 0) {
            throw new Error(waitResult.failed[0]?.errorMessage || "格式化导入失败");
        }
        return documentId;
    }
    return {
        activeDocument,
        activeId,
        createDocument,
        createFolder,
        docs,
        editorArchivePath,
        editorMarkdown,
        editorTitle,
        ensureInitialized,
        folders,
        importFiles,
        initialized,
        mode,
        loadAdminWorkspace,
        loadPublicWorkspace,
        loading,
        moveDocument,
        formatEditorTextWithAi,
        saveActiveDocument,
        saving,
        setActive,
        setSelectedFolder,
        selectedFolderPath,
        syncEditorFromActive,
        tree,
        waitForImportTasks,
        usingAdminData
    };
});
