<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import { listPending, removeEntry } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import type { QueueRecord } from "@/offline/db";

const { t } = useI18n();
const router = useRouter();
const sync = useSyncStore();
const rows = ref<QueueRecord[]>([]);
// id of the row awaiting a confirm tap. Android WebView silently drops
// window.prompt / window.confirm, so we implement the two-tap pattern
// inline: first tap flips the button to "Tap again to confirm", second
// tap actually deletes. Avoids the `prompt` returning null trap.
const pendingDelete = ref<string | null>(null);

async function refresh() {
  rows.value = (await listPending()).filter((r) => r.lastError);
}
onMounted(refresh);

async function retry() {
  await sync.triggerDrain();
  await sync.refresh();
  await refresh();
}

async function deleteOne(id: string) {
  if (pendingDelete.value !== id) {
    pendingDelete.value = id;
    // Auto-cancel the armed state after 4s so a stray first tap doesn't
    // leave the destructive button hot indefinitely.
    window.setTimeout(() => {
      if (pendingDelete.value === id) pendingDelete.value = null;
    }, 4000);
    return;
  }
  pendingDelete.value = null;
  await removeEntry(id);
  // Re-pull sync store so the top bar badge updates immediately.
  await sync.refresh();
  await refresh();
}
</script>

<template>
  <main class="syncerr">
    <TopAppBar :title="t('sync_errors.title')" back @back="router.back()" />
    <SyncBar />
    <p v-if="!rows.length" class="syncerr__empty">{{ t('sync_errors.empty') }}</p>
    <ul class="syncerr__list">
      <li v-for="r in rows" :key="r.id" class="syncerr__row">
        <div class="syncerr__head">
          <strong>{{ r.kind }}</strong>
          <Chip variant="rejected">{{ r.lastError?.code }}</Chip>
        </div>
        <p class="syncerr__msg">{{ r.lastError?.message }}</p>
        <div class="syncerr__actions">
          <AppButton variant="ghost" @click="retry">{{ t('sync_errors.retry') }}</AppButton>
          <AppButton
            variant="destructive"
            @click="deleteOne(r.id)"
          >
            {{ pendingDelete === r.id ? t('sync_errors.confirm_delete') : t('sync_errors.delete_one') }}
          </AppButton>
        </div>
      </li>
    </ul>
    <BottomNav />
  </main>
</template>

<style scoped>
.syncerr { padding-bottom: 120px; }
.syncerr__empty { padding: 40px var(--page-gutter); color: var(--ink-secondary); text-align: center; }
.syncerr__list {
  list-style: none; padding: 0 var(--page-gutter);
  display: flex; flex-direction: column; gap: 12px;
}
.syncerr__row {
  background: var(--bg-surface); border-radius: var(--r-lg);
  box-shadow: var(--e-1); padding: 12px;
}
.syncerr__head { display: flex; align-items: center; justify-content: space-between; }
.syncerr__msg { color: var(--ink-secondary); font-size: 13px; margin: 8px 0; }
.syncerr__actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
