import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../lib/api";

export type WorkspaceDoc = {
  id: string;
  title: string;
  archivePath: string;
  markdownSource: string;
  updatedAt?: string;
};

export type WorkspaceFolder = {
  id: string;
  name: string;
  fullPath: string;
  parentPath: string | null;
};

export type WorkspaceTreeNode = {
  key: string;
  name: string;
  fullPath: string;
  children: WorkspaceTreeNode[];
  documents: WorkspaceDoc[];
};

function buildDemoDocs(): WorkspaceDoc[] {
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

function buildDemoFolders(): WorkspaceFolder[] {
  return [
    { id: "demo-recent", name: "最近文档", fullPath: "最近文档", parentPath: null }
  ];
}

function normalizeFolder(value: string) {
  return value
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

function getTreePath(value: string) {
  const normalized = normalizeFolder(value);
  return normalized || "未归档";
}

function toArchivePath(value: string) {
  const normalized = normalizeFolder(value);
  return normalized === "未归档" ? "" : normalized;
}

function isPersistedDocumentId(value: string) {
  return /^\d+$/.test(value);
}

function ensureFolderPathSet(paths: Set<string>, path: string) {
  const normalized = normalizeFolder(path);
  if (!normalized) return;
  const segments = normalized.split("/");
  for (let i = 0; i < segments.length; i += 1) {
    paths.add(segments.slice(0, i + 1).join("/"));
  }
}

export const useWorkspaceStore = defineStore("workspace", () => {
  const docs = ref<WorkspaceDoc[]>([]);
  const folders = ref<WorkspaceFolder[]>([]);
  const activeId = ref("");
  const loading = ref(false);
  const saving = ref(false);
  const initialized = ref(false);
  const usingAdminData = ref(false);
  const selectedFolderPath = ref("未归档");

  const editorTitle = ref("");
  const editorArchivePath = ref("");
  const editorMarkdown = ref("");

  const activeDocument = computed(() => docs.value.find((doc) => doc.id === activeId.value) ?? docs.value[0] ?? null);
  const tree = computed<WorkspaceTreeNode[]>(() => {
    const folderPathSet = new Set<string>();
    folders.value.forEach((folder) => ensureFolderPathSet(folderPathSet, folder.fullPath));
    docs.value.forEach((doc) => ensureFolderPathSet(folderPathSet, getTreePath(doc.archivePath)));

    const nodeMap = new Map<string, WorkspaceTreeNode>();

    const getNode = (fullPath: string) => {
      if (!nodeMap.has(fullPath)) {
        nodeMap.set(fullPath, {
          key: fullPath,
          name: fullPath.split("/").slice(-1)[0] ?? fullPath,
          fullPath,
          children: [],
          documents: []
        });
      }
      return nodeMap.get(fullPath)!;
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

    const sortNode = (node: WorkspaceTreeNode) => {
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
    if (initialized.value) return;
    docs.value = buildDemoDocs();
    folders.value = buildDemoFolders();
    activeId.value = docs.value[0]?.id ?? "";
    syncEditorFromActive();
    initialized.value = true;
    usingAdminData.value = false;
  }

  function setActive(id: string) {
    activeId.value = id;
    syncEditorFromActive();
  }

  function setSelectedFolder(path: string) {
    selectedFolderPath.value = getTreePath(path);
  }

  async function loadPublicWorkspace() {
    ensureInitialized();
    loading.value = true;
    try {
      const [searchResult, folderResult] = await Promise.all([
        api.publicSearch({
          page: 1,
          pageSize: 100,
          sortBy: "updatedAt",
          order: "desc"
        }),
        api.publicFolders()
      ]);

      const details = await Promise.all(
        searchResult.items.map(async (item) => {
          const doc = await api.publicDocument(String(item.id));
          return {
            id: String(doc.id),
            title: String(doc.title ?? ""),
            archivePath: String(doc.archivePath ?? item.archivePath ?? ""),
            markdownSource: String(doc.markdownContent ?? ""),
            updatedAt: String(doc.updatedAt ?? item.updatedAt ?? "")
          } satisfies WorkspaceDoc;
        })
      );

      docs.value = details;
      folders.value = folderResult.items.map((item) => ({
        id: String(item.id),
        name: String(item.name),
        fullPath: String(item.fullPath),
        parentPath: item.parentPath ? String(item.parentPath) : null
      }));
      activeId.value = details.some((doc) => doc.id === activeId.value) ? activeId.value : details[0]?.id ?? "";
      syncEditorFromActive();
      usingAdminData.value = false;
    } finally {
      loading.value = false;
    }
  }

  async function loadAdminWorkspace(token: string) {
    ensureInitialized();
    loading.value = true;
    try {
      const [searchResult, folderResult] = await Promise.all([
        api.publicSearch({
          page: 1,
          pageSize: 100,
          sortBy: "updatedAt",
          order: "desc"
        }),
        api.listFolders(token)
      ]);

      const details = await Promise.all(
        searchResult.items.map(async (item) => {
          const doc = await api.getDocument(String(item.id), token);
          return {
            id: String(doc.id),
            title: String(doc.title ?? ""),
            archivePath: String(doc.archivePath ?? ""),
            markdownSource: String(doc.markdownContent ?? ""),
            updatedAt: String(doc.updatedAt ?? "")
          } satisfies WorkspaceDoc;
        })
      );

      docs.value = details;
      folders.value = folderResult.items.map((item) => ({
        id: String(item.id),
        name: String(item.name),
        fullPath: String(item.fullPath),
        parentPath: item.parentPath ? String(item.parentPath) : null
      }));
      activeId.value = details.some((doc) => doc.id === activeId.value) ? activeId.value : details[0]?.id ?? "";
      syncEditorFromActive();
      usingAdminData.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function createDocument(token: string, title: string) {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;
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

  async function importFiles(token: string, files: File[]) {
    if (files.length === 0) return;
    const formData = new FormData();
    files.forEach((file) => formData.append(files.length > 1 ? "files" : "file", file));
    formData.append("title", files[0].name.replace(/\.[^.]+$/, ""));
    const targetPath = toArchivePath(selectedFolderPath.value || editorArchivePath.value);
    if (targetPath) {
      formData.append("archivePath", targetPath);
    }
    if (files.length > 1) {
      await api.uploadBatch(formData, token);
    } else {
      await api.uploadDocument(formData, token);
    }
    await loadAdminWorkspace(token);
  }

  async function createFolder(token: string, folderName: string) {
    const normalized = normalizeFolder(folderName);
    if (!normalized) return;
    await api.createFolder(normalized, token);
    await loadAdminWorkspace(token);
  }

  async function saveActiveDocument(token: string) {
    if (!activeDocument.value) return;
    if (!isPersistedDocumentId(activeDocument.value.id)) {
      throw new Error("当前文档是演示文档，不能直接保存到后端");
    }
    saving.value = true;
    try {
      await api.updateDocument(
        activeDocument.value.id,
        {
          title: editorTitle.value,
          archivePath: editorArchivePath.value
        },
        token
      );
      await api.updateDocumentContent(
        activeDocument.value.id,
        {
          markdownContent: editorMarkdown.value,
          changeNote: "Admin workspace editor update"
        },
        token
      );
      await loadAdminWorkspace(token);
      setActive(activeDocument.value.id);
    } finally {
      saving.value = false;
    }
  }

  async function moveDocument(token: string, documentId: string, targetPath: string) {
    await api.updateDocument(
      documentId,
      {
        archivePath: toArchivePath(targetPath)
      },
      token
    );
    await loadAdminWorkspace(token);
    const movedDoc = docs.value.find((doc) => doc.id === documentId);
    if (movedDoc) {
      setActive(movedDoc.id);
    }
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
    loadAdminWorkspace,
    loadPublicWorkspace,
    loading,
    moveDocument,
    saveActiveDocument,
    saving,
    setActive,
    setSelectedFolder,
    selectedFolderPath,
    syncEditorFromActive,
    tree,
    usingAdminData
  };
});
