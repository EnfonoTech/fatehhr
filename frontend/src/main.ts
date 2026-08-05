import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "@/app/App.vue";
import { createAppRouter } from "@/app/router";
import { appI18n, setLocale } from "@/app/i18n";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { utilApi } from "@/api/util";
import { NATIVE_VERSION } from "@/app/native-version";
import { loadSiteUrl } from "@/app/platform";
import { installConfigRefresh, refreshConfig } from "@/app/config-refresh";
import "@/offline/processors/checkin";
import "@/offline/processors/leave";
import "@/offline/processors/expense";
import "@/offline/processors/task-timer";
import "@/offline/processors/profile";
import "@/styles/tokens.css";
import "@/styles/base.css";

const app = createApp(App);
app.use(createPinia());
app.use(createAppRouter());
app.use(appI18n);

setLocale(appI18n.global.locale.value as "en" | "ar");

// Hydrate the stored server address BEFORE mounting. Mounting starts the first
// navigation, and the router guard's very first decision is "is a server
// configured?" — mount early and a configured app flashes the setup screen.
// `loadSiteUrl()` never rejects; `.finally` is belt-and-braces so a thrown
// Preferences bridge error can't leave the app unmounted (commandment 21).
void loadSiteUrl().finally(() => {
  app.mount("#app");
  wirePostMount();
});

function wirePostMount() {
  const session = useSessionStore();
  const sync = useSyncStore();

  void sync.refresh().then(() => {
    if (sync.isOnline && sync.pending > 0) return sync.triggerDrain();
  });

  // Capacitor Network listener: fires even when webview is backgrounded on
  // Android. This is the "background sync" that the pure PWA lacks.
  void (async () => {
    try {
      const { onNetworkChange, getNetworkStatus } = await import("@/app/frappe");
      const status = await getNetworkStatus();
      sync.setOnline(status.connected);
      await onNetworkChange((s) => {
        const cameOnline = s.connected && !sync.isOnline;
        sync.setOnline(s.connected);
        // offline→online is the other moment a long-lived session can catch up
        // on server-side config changes (ref runtime-site-switching §6).
        if (cameOnline) void refreshConfig();
      });
    } catch {
      // Not in a Capacitor context — fall back to window.online/offline in SyncBar.
    }
  })();

  installConfigRefresh();

  ["pointerdown", "keydown", "touchstart", "focus"].forEach((ev) =>
    window.addEventListener(ev, () => session.bumpActivity(), { passive: true }),
  );

  setInterval(() => {
    if (session.shouldReprompt()) {
      session.isPinVerified = false;
      if (!location.pathname.endsWith("/pin") && location.hash.indexOf("#/pin") === -1) {
        // Force nav to PIN; uses history style based on router config
        window.location.hash = "#/pin";
      }
    }
  }, 30_000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session.shouldReprompt()) {
      session.isPinVerified = false;
      window.location.hash = "#/pin";
    }
  });

  // Version-compat probe (frappe-vue-pwa §7). Non-blocking on offline, and on a
  // fresh install API_BASE() throws until setup finishes — also caught here.
  void (async () => {
    try {
      const compat = await utilApi.versionCompat(NATIVE_VERSION);
      if (isOlder(NATIVE_VERSION, compat.min_client_version)) {
        showUpdateWall(compat.min_client_version);
      }
    } catch {
      /* offline on first launch is fine */
    }
  })();
}

/**
 * Hard stop when the server declares this build too old to trust. Built with
 * DOM nodes and `textContent`, not `innerHTML` — `min_client_version` arrives
 * over the wire, and the whole point of this screen is that it renders when the
 * client and server disagree.
 */
function showUpdateWall(minVersion: string) {
  const wrap = document.createElement("div");
  wrap.setAttribute("style", "padding:40px;text-align:center;font-family:Georgia,serif");

  const heading = document.createElement("h2");
  heading.textContent = "Please update the app.";

  const detail = document.createElement("p");
  detail.textContent = `Minimum version ${minVersion} — you have ${NATIVE_VERSION}.`;

  wrap.append(heading, detail);
  document.body.replaceChildren(wrap);
}

function isOlder(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
  }
  return false;
}
