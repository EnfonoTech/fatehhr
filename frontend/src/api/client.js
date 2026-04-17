import { API_BASE } from "@/app/platform";
import { useSessionStore } from "@/stores/session";
export class ApiError extends Error {
    status;
    body;
    constructor(status, body, message) {
        super(message);
        this.status = status;
        this.body = body;
    }
}
function stripRetry(b) {
    if (!b || typeof b !== "object")
        return b;
    const { __retry: _unused, ...rest } = b;
    return rest;
}
export async function apiCall(method, endpoint, body) {
    const session = useSessionStore();
    const base = API_BASE();
    const url = `${base}/api/method/${endpoint}`;
    const headers = {
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
    let data = undefined;
    try {
        data = text ? JSON.parse(text) : undefined;
    }
    catch {
        /* ignore non-JSON */
    }
    if (resp.status === 401 && !(body && body.__retry)) {
        // One silent retry after re-hydrating session (frappe-vue-pwa §7).
        await session.hydrate();
        return apiCall(method, endpoint, { ...(body ?? {}), __retry: true });
    }
    if (!resp.ok) {
        const d = data;
        const msg = d?.exception || d?.message || resp.statusText;
        if (resp.status === 401)
            session.clear();
        throw new ApiError(resp.status, data, msg);
    }
    const d = data;
    return (d?.message ?? d);
}
