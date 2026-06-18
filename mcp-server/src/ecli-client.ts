const API_BASE = process.env.ECLI_API_URL || "http://localhost:3432/api";
const API_KEY = process.env.ECLI_ADMIN_KEY || "";

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query } = opts;

  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Key": API_KEY,
  };

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`EcliPanel API ${method} ${path} failed (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const ecliApi = {
  servers: {
    list: (page = 1, limit = 25) =>
      request<any[]>("/servers", { query: { page, limit } }),

    get: (id: string) =>
      request<any>(`/servers/${id}`),

    power: (id: string, action: "start" | "stop" | "restart" | "kill") =>
      request(`/servers/${id}/power`, { method: "POST", body: { action } }),

    getStats: (id: string) =>
      request<any>(`/servers/${id}/stats`),

    sendCommand: (id: string, command: string) =>
      request(`/servers/${id}/commands`, { method: "POST", body: { command } }),

    getFiles: (id: string, directory = "/") =>
      request<any[]>(`/servers/v1/${id}/files`, { query: { directory } }),

    readFile: (id: string, path: string) =>
      request<any>(`/servers/v1/${id}/files/read`, { query: { path } }),

    writeFile: (id: string, path: string, content: string) =>
      request(`/servers/v1/${id}/files/write`, { method: "POST", body: { path, content } }),

    getBackups: (id: string) =>
      request<any[]>(`/servers/v1/${id}/backups`),

    createBackup: (id: string, name?: string) =>
      request(`/servers/v1/${id}/backups`, { method: "POST", body: { name } }),
  },

  users: {
    me: () =>
      request<any>("/users/me"),

    list: (page = 1, limit = 25) =>
      request<any[]>("/users", { query: { page, limit } }),

    get: (id: number) =>
      request<any>(`/users/${id}`),

    updateSettings: (settings: Record<string, any>) =>
      request("/users/me/settings", { method: "PATCH", body: { settings } }),
  },

  nodes: {
    list: () =>
      request<any[]>("/nodes"),

    get: (id: number) =>
      request<any>(`/nodes/${id}`),
  },

  organisations: {
    list: () =>
      request<any[]>("/organisations"),

    get: (id: number) =>
      request<any>(`/organisations/${id}`),

    getDnsZones: (orgId: number) =>
      request<any[]>(`/organisations/${orgId}/dns/zones`),

    getDnsRecords: (orgId: number, zoneId: string) =>
      request<any[]>(`/organisations/${orgId}/dns/zones/${zoneId}/records`),
  },

  tickets: {
    list: (page = 1, limit = 25) =>
      request<any[]>("/tickets", { query: { page, limit } }),

    get: (id: number) =>
      request<any>(`/tickets/${id}`),

    create: (subject: string, message: string, priority?: string) =>
      request("/tickets", { method: "POST", body: { subject, message, priority } }),

    reply: (id: number, message: string) =>
      request(`/tickets/${id}/replies`, { method: "POST", body: { message } }),
  },

  ai: {
    chat: (message: string, modelId?: number) =>
      request<any>("/ai/chat", { method: "POST", body: { message, modelId } }),

    listModels: () =>
      request<any[]>("/ai/models"),

    myModels: () =>
      request<any[]>("/ai/my-models"),
  },

  admin: {
    listUsers: (page = 1, limit = 50) =>
      request<any[]>("/admin/users", { query: { page, limit } }),

    suspendServer: (id: string) =>
      request(`/servers/${id}/suspend`, { method: "POST" }),

    unsuspendServer: (id: string) =>
      request(`/servers/${id}/unsuspend`, { method: "POST" }),
  },
};