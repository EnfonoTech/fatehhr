import type { Router } from "vue-router";
import { isNative } from "./platform";

/**
 * Android hardware-back wiring.
 *
 * Native behaviour users expect (and that testing reported was missing):
 *   - On a detail route (e.g. /payslip/ABC) → go back to its list.
 *   - On a list route (e.g. /payslip)      → go home (/).
 *   - On home (/)                          → double-tap within 2s exits.
 *
 * Capacitor's default listener goes straight to `App.exitApp()` whenever
 * there's no history entry, which is what caused "back button exits
 * immediately" complaints after app-kill restores with a single-entry stack.
 */

const EXIT_WINDOW_MS = 2000;
const TOAST_KEY = "fatehhr.back_toast";

let lastBackAt = 0;

function showExitHint(message: string) {
  // Lightweight toast — avoid pulling in a UI library just for this.
  const existing = document.getElementById(TOAST_KEY);
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = TOAST_KEY;
  el.textContent = message;
  el.setAttribute(
    "style",
    [
      "position:fixed",
      "left:50%",
      "bottom:120px",
      "transform:translateX(-50%)",
      "background:rgba(0,0,0,0.82)",
      "color:#fff",
      "padding:10px 18px",
      "border-radius:999px",
      "font-size:13px",
      "font-family:inherit",
      "z-index:9999",
      "pointer-events:none",
      "box-shadow:0 4px 12px rgba(0,0,0,0.25)",
    ].join(";"),
  );
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), EXIT_WINDOW_MS);
}

export async function installNativeBackHandler(router: Router): Promise<void> {
  if (!isNative()) return;
  // Dynamic import so the web build doesn't pull Capacitor's App plugin in.
  const { App } = await import("@capacitor/app");

  App.addListener("backButton", async () => {
    const current = router.currentRoute.value;

    // 1. Detail-ish routes: delegate to the router so Vue handles the
    //    back navigation (it has a proper stack of the user's path).
    const isHome = current.path === "/" || current.name === "dashboard";
    const hasHistory = window.history.length > 1;

    if (!isHome) {
      if (hasHistory) {
        router.back();
      } else {
        router.replace("/");
      }
      return;
    }

    // 2. On home: double-tap-to-exit within a 2s window.
    const now = Date.now();
    if (now - lastBackAt <= EXIT_WINDOW_MS) {
      await App.exitApp();
      return;
    }
    lastBackAt = now;
    showExitHint("Press back again to exit");
  });
}
