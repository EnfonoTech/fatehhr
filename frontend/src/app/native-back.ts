import type { Router } from "vue-router";
import { isNative } from "./platform";

/**
 * Android hardware-back wiring.
 *
 * Route-hierarchy based (NOT `window.history`):
 *   - Detail routes (/payslip/:name)        → parent list (/payslip)
 *   - Top-level sections (/leave, /tasks…)  → home (/)
 *   - Home (/)                              → double-tap within 2s exits
 *
 * Using `router.back()` / `window.history` walked every visited screen,
 * so "Home → Attendance → Leave → Expense" + Back cycled Expense → Leave →
 * Attendance → Home, surprising users. The hierarchy map makes Back always
 * feel like "up one level", not "undo the last navigation".
 */

const EXIT_WINDOW_MS = 2000;
const TOAST_KEY = "fatehhr.back_toast";

let lastBackAt = 0;

/** route.name → parent route path. Anything not listed falls back to "/". */
const PARENT_BY_ROUTE_NAME: Record<string, string> = {
  // Check-in
  "checkin": "/",
  "checkin.history": "/checkin",
  // Attendance
  "attendance": "/",
  // Leave
  "leave": "/",
  "leave.apply": "/leave",
  "leave.list": "/leave",
  // Expense
  "expense": "/",
  "expense.new": "/expense",
  // Tasks
  "tasks": "/",
  // Payslip
  "payslip": "/",
  "payslip.detail": "/payslip",
  // Announcements
  "announce": "/",
  "announce.detail": "/announcements",
  // Other top-level
  "notifications": "/",
  "profile": "/",
  "more": "/",
  "sync.errors": "/more",
};

function showExitHint(message: string) {
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
    const routeName = typeof current.name === "string" ? current.name : "";
    const isHome = current.path === "/" || routeName === "dashboard";

    if (!isHome) {
      const parent = PARENT_BY_ROUTE_NAME[routeName] ?? "/";
      // Use replace so we don't grow the history stack; the hierarchy map
      // already picks the correct destination — history is irrelevant.
      router.replace(parent);
      return;
    }

    // On home: double-tap-to-exit within a 2s window.
    const now = Date.now();
    if (now - lastBackAt <= EXIT_WINDOW_MS) {
      await App.exitApp();
      return;
    }
    lastBackAt = now;
    showExitHint("Press back again to exit");
  });
}
