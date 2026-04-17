<script setup lang="ts">
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
  if (sync.isOnline && sync.pending > 0) await sync.triggerDrain();
});

onUnmounted(() => {
  window.removeEventListener("online", onOnline);
  window.removeEventListener("offline", onOffline);
});

function shortRelative(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const label = computed(() => {
  if (!sync.isOnline) return t("sync.offline");
  if (sync.status === "syncing") return t("sync.syncing");
  if (sync.errorCount > 0) return t("sync.errored", { n: sync.errorCount });
  if (sync.pending > 0) return t("sync.pending", { n: sync.pending });
  if (sync.lastSyncedAt) return t("sync.synced", { when: shortRelative(sync.lastSyncedAt) });
  return t("sync.ready");
});

const className = computed(() => {
  if (!sync.isOnline) return "sync-bar sync-bar--offline";
  if (sync.status === "syncing") return "sync-bar sync-bar--syncing";
  if (sync.errorCount > 0) return "sync-bar sync-bar--errored";
  if (sync.pending > 0) return "sync-bar sync-bar--pending";
  return "sync-bar sync-bar--ok";
});

async function onTap() {
  if (sync.pending > 0 && sync.isOnline) await sync.triggerDrain();
}
</script>

<template>
  <button :class="className" role="status" @click="onTap">
    <span class="sync-bar__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.sync-bar {
  display: block; width: 100%;
  padding: 8px var(--page-gutter);
  font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  text-align: center; background: transparent; color: var(--ink-secondary);
}
.sync-bar--pending { background: var(--accent-soft); color: var(--ink-primary); }
.sync-bar--syncing { background: var(--accent-soft); color: var(--ink-primary); animation: breathe 3s ease-in-out infinite; }
.sync-bar--offline { background: var(--warning-soft); color: var(--warning); }
.sync-bar--errored { background: var(--danger-soft); color: var(--danger); }
@keyframes breathe { 0%, 100% { opacity: 1; } 50% { opacity: .7; } }
@media (prefers-reduced-motion: reduce) { .sync-bar--syncing { animation: none; } }
</style>
