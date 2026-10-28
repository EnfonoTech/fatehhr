// iPhone/iPad Safari has no install prompt (no beforeinstallprompt), so the
// only way to "install" the PWA is Share -> Add to Home Screen. We show a
// one-time hint for that; Android/desktop and the native APK never see it.

export const DISMISS_KEY = "fatehhr.installHint.dismissed";

export type InstallHint = "none" | "add-to-home" | "open-in-safari";

export interface InstallEnv {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean; // navigator.standalone or display-mode: standalone
  native: boolean;     // Capacitor APK build
  dismissed: boolean;
}

export function isIos(ua: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports a desktop Mac user agent; touch points give it away.
  return /Macintosh/i.test(ua) && maxTouchPoints > 1;
}

// In-app browsers (Instagram, Facebook, LINE...) have no Add to Home Screen.
function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|Instagram|Line\/|Snapchat|GSA\//i.test(ua);
}

export function installHint(env: InstallEnv): InstallHint {
  if (env.native || env.standalone || env.dismissed) return "none";
  if (!isIos(env.userAgent, env.maxTouchPoints)) return "none";
  return isInAppBrowser(env.userAgent) ? "open-in-safari" : "add-to-home";
}

export function readInstallEnv(native: boolean): InstallEnv {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* private mode */ }
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints || 0,
    standalone: nav.standalone === true
      || Boolean(window.matchMedia?.("(display-mode: standalone)").matches),
    native,
    dismissed,
  };
}

export function dismissInstallHint(): void {
  try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
}
