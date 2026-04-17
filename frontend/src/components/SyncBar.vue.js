import { computed, onMounted, onUnmounted } from "vue";
import { useSyncStore } from "@/stores/sync";
import { useI18n } from "vue-i18n";
const sync = useSyncStore();
const { t } = useI18n();
function onOnline() { sync.setOnline(true); }
function onOffline() { sync.setOnline(false); }
onMounted(async () => {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    await sync.refresh();
    if (sync.isOnline && sync.pending > 0)
        await sync.triggerDrain();
});
onUnmounted(() => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
});
function shortRelative(iso) {
    const diff = Date.now() - Date.parse(iso);
    const m = Math.floor(diff / 60000);
    if (m < 1)
        return "now";
    if (m < 60)
        return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24)
        return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}
const label = computed(() => {
    if (!sync.isOnline)
        return t("sync.offline");
    if (sync.status === "syncing")
        return t("sync.syncing");
    if (sync.errorCount > 0)
        return t("sync.errored", { n: sync.errorCount });
    if (sync.pending > 0)
        return t("sync.pending", { n: sync.pending });
    if (sync.lastSyncedAt)
        return t("sync.synced", { when: shortRelative(sync.lastSyncedAt) });
    return t("sync.ready");
});
const className = computed(() => {
    if (!sync.isOnline)
        return "sync-bar sync-bar--offline";
    if (sync.status === "syncing")
        return "sync-bar sync-bar--syncing";
    if (sync.errorCount > 0)
        return "sync-bar sync-bar--errored";
    if (sync.pending > 0)
        return "sync-bar sync-bar--pending";
    return "sync-bar sync-bar--ok";
});
async function onTap() {
    if (sync.pending > 0 && sync.isOnline)
        await sync.triggerDrain();
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sync-bar--syncing']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.onTap) },
    ...{ class: (__VLS_ctx.className) },
    role: "status",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "sync-bar__label" },
});
(__VLS_ctx.label);
/** @type {__VLS_StyleScopedClasses['sync-bar__label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            label: label,
            className: className,
            onTap: onTap,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
