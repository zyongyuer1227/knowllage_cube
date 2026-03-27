const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: BodyInit | null;
  headers?: Record<string, string>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
    return (await response.json()) as T;
  }

  return (await response.blob()) as T;
}

export type LoginPayload = {
  username: string;
  password: string;
  captcha: string;
};

export type SearchParams = Record<string, string | number | undefined>;

export const api = {
  login(payload: LoginPayload) {
    return request<{ token: string; user: { id: string; username: string; role: string } }>("/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  },
  publicSearch(params: SearchParams) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        qs.set(key, String(value));
      }
    });
    return request<{
      total: number;
      page: number;
      pageSize: number;
      items: Array<Record<string, unknown>>;
    }>(`/public/search?${qs.toString()}`);
  },
  suggest(query: string) {
    return request<{ query: string; items: string[] }>(`/public/search/suggest?q=${encodeURIComponent(query)}`);
  },
  publicDocument(id: string) {
    return request<Record<string, unknown>>(`/public/documents/${id}`);
  },
  publicFolders() {
    return request<{ total: number; items: Array<Record<string, unknown>> }>("/public/search/folders");
  },
  uploadDocument(formData: FormData, token: string) {
    return request<Record<string, unknown>>("/admin/documents/upload", {
      method: "POST",
      token,
      body: formData
    });
  },
  uploadBatch(formData: FormData, token: string) {
    return request<Record<string, unknown>>("/admin/documents/upload/batch", {
      method: "POST",
      token,
      body: formData
    });
  },
  getDocument(id: string, token: string) {
    return request<Record<string, unknown>>(`/admin/documents/${id}`, { token });
  },
  updateDocument(id: string, payload: Record<string, unknown>, token: string) {
    return request<Record<string, unknown>>(`/admin/documents/${id}`, {
      method: "PUT",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  },
  updateDocumentContent(id: string, payload: Record<string, unknown>, token: string) {
    return request<Record<string, unknown>>(`/admin/documents/${id}/content`, {
      method: "PUT",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  },
  deleteDocument(id: string, token: string) {
    return request<Record<string, unknown>>(`/admin/documents/${id}`, {
      method: "DELETE",
      token
    });
  },
  listFolders(token: string) {
    return request<{ total: number; items: Array<Record<string, unknown>> }>("/admin/documents/folders", { token });
  },
  createFolder(path: string, token: string) {
    return request<Record<string, unknown>>("/admin/documents/folders", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    });
  },
  listVersions(id: string, token: string) {
    return request<{ total: number; items: Array<Record<string, unknown>> }>(`/admin/documents/${id}/versions`, { token });
  },
  getVersionDiff(id: string, versionNo: number, targetVersionNo: number, token: string) {
    return request<Record<string, unknown>>(
      `/admin/documents/${id}/versions/${versionNo}/diff?targetVersionNo=${targetVersionNo}`,
      { token }
    );
  },
  rollbackVersion(id: string, versionNo: number, token: string, changeNote?: string) {
    return request<Record<string, unknown>>(`/admin/documents/${id}/versions/${versionNo}/rollback`, {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeNote })
    });
  },
};

export { API_BASE_URL };
