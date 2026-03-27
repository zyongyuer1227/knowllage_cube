const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
async function request(path, options = {}) {
    const headers = new Headers(options.headers ?? {});
    if (options.token) {
        headers.set("Authorization", `Bearer ${options.token}`);
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body ?? null
    });
    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        return (await response.json());
    }
    return (await response.blob());
}
export const api = {
    login(payload) {
        return request("/admin/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    },
    publicSearch(params) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== "") {
                qs.set(key, String(value));
            }
        });
        return request(`/public/search?${qs.toString()}`);
    },
    suggest(query) {
        return request(`/public/search/suggest?q=${encodeURIComponent(query)}`);
    },
    publicDocument(id) {
        return request(`/public/documents/${id}`);
    },
    publicFolders() {
        return request("/public/search/folders");
    },
    uploadDocument(formData, token) {
        return request("/admin/documents/upload", {
            method: "POST",
            token,
            body: formData
        });
    },
    uploadBatch(formData, token) {
        return request("/admin/documents/upload/batch", {
            method: "POST",
            token,
            body: formData
        });
    },
    getDocument(id, token) {
        return request(`/admin/documents/${id}`, { token });
    },
    updateDocument(id, payload, token) {
        return request(`/admin/documents/${id}`, {
            method: "PUT",
            token,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    },
    updateDocumentContent(id, payload, token) {
        return request(`/admin/documents/${id}/content`, {
            method: "PUT",
            token,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    },
    deleteDocument(id, token) {
        return request(`/admin/documents/${id}`, {
            method: "DELETE",
            token
        });
    },
    listFolders(token) {
        return request("/admin/documents/folders", { token });
    },
    createFolder(path, token) {
        return request("/admin/documents/folders", {
            method: "POST",
            token,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path })
        });
    },
    listVersions(id, token) {
        return request(`/admin/documents/${id}/versions`, { token });
    },
    getVersionDiff(id, versionNo, targetVersionNo, token) {
        return request(`/admin/documents/${id}/versions/${versionNo}/diff?targetVersionNo=${targetVersionNo}`, { token });
    },
    rollbackVersion(id, versionNo, token, changeNote) {
        return request(`/admin/documents/${id}/versions/${versionNo}/rollback`, {
            method: "POST",
            token,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ changeNote })
        });
    },
};
export { API_BASE_URL };
