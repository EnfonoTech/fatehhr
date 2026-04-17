import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "@/app/App.vue";
import { createAppRouter } from "@/app/router";
import { appI18n, setLocale } from "@/app/i18n";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { utilApi } from "@/api/util";
import { NATIVE_VERSION } from "@/app/native-version";
import "@/offline/processors/checkin";
import "@/styles/tokens.css";
import "@/styles/base.css";
const app = createApp(App);
app.use(createPinia());
app.use(createAppRouter());
app.use(appI18n);
setLocale(appI18n.global.locale.value);
app.mount("#app");
// ---- post-mount wiring ----
const session = useSessionStore();
const sync = useSyncStore();
void sync.refresh().then(() => {
    if (sync.isOnline && sync.pending > 0)
        return sync.triggerDrain();
});
["pointerdown", "keydown", "touchstart", "focus"].forEach((ev) => window.addEventListener(ev, () => session.bumpActivity(), { passive: true }));
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
// Version-compat probe (frappe-vue-pwa §7). Non-blocking on offline.
void (async () => {
    try {
        const compat = await utilApi.versionCompat(NATIVE_VERSION);
        if (isOlder(NATIVE_VERSION, compat.min_client_version)) {
            document.body.innerHTML = `<div style="padding:40px;text-align:center;font-family:Georgia,serif">
        <h2>Please update the app.</h2>
        <p>Minimum version ${compat.min_client_version} — you have ${NATIVE_VERSION}.</p>
      </div>`;
        }
    }
    catch {
        /* offline on first launch is fine */
    }
})();
function isOlder(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) < (pb[i] ?? 0))
            return true;
        if ((pa[i] ?? 0) > (pb[i] ?? 0))
            return false;
    }
    return false;
}
