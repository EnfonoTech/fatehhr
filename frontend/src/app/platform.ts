// STATIC import per frappe-vue-pwa §3.4 / commandment 14. Do NOT dynamic-import
// @capacitor/* — it hangs silently in the Android WebView.
import { Preferences } from "@capacitor/preferences";
import { CUSTOMER_ERP_DOMAIN, CUSTOMER_BUILD_TARGET } from "virtual:fatehhr-theme";

const SITE_URL_KEY = "fatehhr.siteUrl";

export function isNative(): boolean {
  if (CUSTOMER_BUILD_TARGET === "native") return true;
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * Seeded SYNCHRONOUSLY at import — commandment 21.
 *
 * `loadSiteUrl()` runs before `app.mount()`, and the site URL must be readable
 * by the first router guard. This app's `isNative()` is build-time flagged so it
 * would answer correctly that early, but `secureGet()` in app/frappe.ts is NOT:
 * it gates on `Capacitor.isNativePlatform()`, which needs the injected bridge.
 * Routing the site URL through `secureGet` would therefore reintroduce the
 * vansale cold-start bug by a side door. Hence localStorage, read synchronously,
 * with Preferences as a mirror rather than the source of truth.
 */
function readStored(): string | null {
  try {
    return window.localStorage.getItem(SITE_URL_KEY) || null;
  } catch {
    return null;
  }
}
let runtimeSiteUrl: string | null = typeof window === "undefined" ? null : readStored();

export type SiteUrlErrorCode = "empty" | "invalid" | "incomplete";

/**
 * Carries a code rather than a message. The setup screen is the first thing a
 * new user sees and this app ships Arabic, so the wording has to come from the
 * locale files — a hardcoded English string here would be untranslatable.
 */
export class SiteUrlError extends Error {
  constructor(public readonly code: SiteUrlErrorCode) {
    super(`Invalid site URL: ${code}`);
    this.name = "SiteUrlError";
  }
}

/**
 * Bare host → origin. Accepts what a field tech actually types: no scheme,
 * a trailing slash, or a pasted deep link. Returns the origin only — the API
 * client appends `/api/method/...` itself, so any path must be dropped.
 */
export function normalizeSiteUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) throw new SiteUrlError("empty");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new SiteUrlError("invalid");
  }
  // A bare word ("hr", "localhos") parses fine as a URL but can never resolve.
  if (!url.hostname.includes(".") && url.hostname !== "localhost") {
    throw new SiteUrlError("incomplete");
  }
  return url.origin;
}

/**
 * Recovers a Preferences-only value written by an older build, then mirrors it
 * into localStorage so the next cold start sees it without awaiting anything.
 */
export async function loadSiteUrl(): Promise<void> {
  if (runtimeSiteUrl) return;
  try {
    const { value } = await Preferences.get({ key: SITE_URL_KEY });
    if (value) {
      runtimeSiteUrl = value;
      try {
        window.localStorage.setItem(SITE_URL_KEY, value);
      } catch {
        /* quota — the Preferences copy still works, just slower to read */
      }
    }
  } catch {
    /* web build, or no native bridge */
  }
}

export async function setSiteUrl(url: string): Promise<void> {
  const origin = normalizeSiteUrl(url);
  runtimeSiteUrl = origin;
  // localStorage FIRST and unconditionally — it is what the next cold start
  // reads synchronously, before the native bridge exists.
  try {
    window.localStorage.setItem(SITE_URL_KEY, origin);
  } catch {
    /* ignore */
  }
  try {
    await Preferences.set({ key: SITE_URL_KEY, value: origin });
  } catch {
    /* web */
  }
}

export async function clearSiteUrl(): Promise<void> {
  runtimeSiteUrl = null;
  try {
    window.localStorage.removeItem(SITE_URL_KEY);
  } catch {
    /* ignore */
  }
  try {
    await Preferences.remove({ key: SITE_URL_KEY });
  } catch {
    /* ignore */
  }
}

/**
 * Build-time default. `CUSTOMER_ERP_DOMAIN` is a bare hostname (see
 * customers/.env.*), so it needs the scheme added. Setting it ships a
 * pre-pointed APK that skips the setup screen; leaving it empty lets the
 * installer choose. It is now a DEFAULT, not the only option.
 */
function defaultSiteUrl(): string | null {
  const host = String(CUSTOMER_ERP_DOMAIN ?? "").trim();
  if (!host) return null;
  try {
    return normalizeSiteUrl(host);
  } catch {
    return null;
  }
}

/** Runtime value, else the build-time default, else null. */
export function siteUrl(): string | null {
  return runtimeSiteUrl ?? defaultSiteUrl();
}

/** True when the stored value came from the user, not from the build. */
export function hasRuntimeSiteUrl(): boolean {
  return Boolean(runtimeSiteUrl);
}

/** Web builds are served by their own Frappe host and never need setup. */
export function needsSiteSetup(): boolean {
  return isNative() && !siteUrl();
}

/**
 * Synchronous — callers use it inline when building a URL. Returns "" on web
 * (same-origin, via the Vite proxy in dev and the reverse proxy in prod).
 *
 * Throws on native with nothing configured. Every caller is behind the auth
 * guard, so the only pre-setup caller is the version-compat probe in main.ts,
 * which is already wrapped in try/catch.
 */
export function API_BASE(): string {
  if (!isNative()) return "";
  const base = siteUrl();
  if (!base) throw new Error("No server configured — finish setup first");
  return base;
}
