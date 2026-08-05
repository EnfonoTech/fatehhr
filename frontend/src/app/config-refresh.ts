import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useSyncStore } from "@/stores/sync";
import { isNative } from "./platform";

/**
 * Re-read server-side config while the app is running.
 *
 * frappe-vue-pwa ref runtime-site-switching §6 / commandment 24. Login here
 * persists until logout or a 401 — the PIN re-prompt is local and never touches
 * the server — so login is no longer a moment when config gets re-fetched. An
 * admin flipping `attendance_mode` in Fateh HR Settings would otherwise never
 * reach a phone that stays signed in for weeks.
 *
 * Silent on failure by design: offline is the normal case in the field, and the
 * localStorage copy in the settings store stays authoritative until a fetch
 * actually succeeds.
 */
export async function refreshConfig(): Promise<void> {
  const session = useSessionStore();
  if (!session.hasApiSecret) return; // signed out — nothing to fetch, and get_public is authed
  const sync = useSyncStore();
  if (!sync.isOnline) return;
  await useSettingsStore().refresh(); // swallows its own errors, keeps the cache
}

export function installConfigRefresh(): void {
  void refreshConfig(); // app start

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshConfig();
  });

  if (!isNative()) return;

  // Android: `visibilitychange` does not reliably fire when the WebView is
  // resumed from the recents list, so listen on the native lifecycle too.
  // Dynamic import matches app/native-back.ts — it keeps @capacitor/app out of
  // the web bundle, and this path only runs once the bridge is already up.
  void (async () => {
    try {
      const { App } = await import("@capacitor/app");
      await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void refreshConfig();
      });
    } catch {
      /* App plugin not bundled */
    }
  })();
}
