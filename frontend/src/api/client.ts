import { API_BASE } from "@/app/platform";
import { useSessionStore } from "@/stores/session";

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

function stripRetry(b: unknown): unknown {
  if (!b || typeof b !== "object") return b;
  const { __retry: _unused, ...rest } = b as Record<string, unknown>;
  return rest;
}

export async function apiCall<T = unknown>(
  method: "GET" | "POST",
  endpoint: string,
  body?: unknown,
): Promise<T> {
  const session = useSessionStore();
  const base = API_BASE();
  const url = `${base}/api/method/${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Frappe-Site-Name": "fatehhr_dev",
  };
  if (session.apiKey && session.apiSecret) {
    headers["Authorization"] = `token ${session.apiKey}:${session.apiSecret}`;
  }

  const resp = await fetch(url, {
    method,
    headers,
    credentials: base ? "omit" : "include",
    body: method === "POST" && body ? JSON.stringify(stripRetry(body)) : undefined,
  });

  const text = await resp.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* ignore non-JSON */
  }

  if (resp.status === 401 && !(body && (body as Record<string, unknown>).__retry)) {
    // One silent retry after re-hydrating session (frappe-vue-pwa §7).
    await session.hydrate();
    return apiCall<T>(method, endpoint, { ...((body as Record<string, unknown>) ?? {}), __retry: true });
  }

  if (!resp.ok) {
    const d = data as { exception?: string; message?: string } | undefined;
    const msg = d?.exception || d?.message || resp.statusText;
    if (resp.status === 401) session.clear();
    throw new ApiError(resp.status, data, msg);
  }

  const d = data as { message?: T } | T | undefined;
  return ((d as { message?: T })?.message ?? (d as T)) as T;
}
