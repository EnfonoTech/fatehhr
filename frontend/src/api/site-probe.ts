/**
 * Pre-setup server probe.
 *
 * Deliberately does NOT go through `apiCall` — that helper resolves its base via
 * `API_BASE()`, and the whole point here is to test a candidate origin that is
 * not stored yet. ref runtime-site-switching §3.
 */

const PROBE_TIMEOUT_MS = 8000;

export type SiteProbeErrorCode = "timeout" | "unreachable" | "not-fatehhr";

export class SiteProbeError extends Error {
  constructor(public readonly code: SiteProbeErrorCode) {
    super(`Site probe failed: ${code}`);
    this.name = "SiteProbeError";
  }
}

/**
 * A wrong host behind a firewall does not refuse the connection — it hangs, for
 * minutes. AbortController is what keeps the setup screen from looking frozen.
 */
async function withTimeout(url: string): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      signal: ac.signal,
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `fetch` rejects with DOMException{name:"AbortError"} on our timeout and with
 * TypeError for DNS failure, TLS failure, offline — and for a CORS rejection,
 * which is indistinguishable from the rest. That last case is why the
 * "unreachable" copy has to mention app access: a real Fateh HR site that has
 * not run `bench migrate` since the CORS hook landed fails here looking exactly
 * like a typo.
 */
function toProbeError(e: unknown): SiteProbeError {
  const name = (e as { name?: string } | null)?.name;
  return new SiteProbeError(name === "AbortError" ? "timeout" : "unreachable");
}

export interface SiteProbeResult {
  /** null when the site answered `frappe.ping` but not `site_info` yet. */
  appVersion: string | null;
}

export async function probeSite(origin: string): Promise<SiteProbeResult> {
  let res: Response;
  try {
    res = await withTimeout(`${origin}/api/method/fatehhr.api.auth.site_info`);
  } catch (e) {
    throw toProbeError(e);
  }

  if (res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: { app?: string; app_version?: string } } | null;
    const msg = body?.message;
    if (msg?.app !== "fatehhr") throw new SiteProbeError("not-fatehhr");
    return { appVersion: msg.app_version ?? null };
  }

  // ANY non-OK status falls through. A site running an older build of the app
  // answers 417 for the missing whitelisted method, NOT 404 — measured, not
  // assumed (commandment 22). Treating only 404 as "old build" would reject
  // every site that has not been updated yet.
  let ping: Response;
  try {
    ping = await withTimeout(`${origin}/api/method/frappe.ping`);
  } catch (e) {
    throw toProbeError(e);
  }
  const body = (await ping.json().catch(() => null)) as { message?: unknown } | null;
  if (!ping.ok || body?.message !== "pong") throw new SiteProbeError("not-fatehhr");

  // frappe.ping exists in every Frappe release, so this is the real reachability
  // test — and it lets a new APK be pointed at a site that has not been updated.
  return { appVersion: null };
}
