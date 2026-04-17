<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import ListRow from "@/components/ListRow.vue";
import BottomNav from "@/components/BottomNav.vue";
import { useCheckinStore } from "@/stores/checkin";

const { t } = useI18n();
const router = useRouter();
const store = useCheckinStore();

onMounted(() => store.loadHistory(1));

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    hour: "2-digit", minute: "2-digit",
    day: "2-digit", month: "short",
  });
}
</script>

<template>
  <main class="hist">
    <TopAppBar :title="t('checkin.history')" back @back="router.back()" />
    <SyncBar />
    <ListRow
      v-for="r in store.history"
      :key="r.name"
      :title="r.log_type === 'IN' ? t('checkin.check_in') : t('checkin.check_out')"
      :subtitle="r.custom_location_address || (r.custom_task ?? '')"
      :trailing="fmt(r.time)"
      :icon="r.log_type === 'IN' ? '↑' : '↓'"
    />
    <p v-if="!store.history.length" class="hist__empty">{{ t('checkin.empty_history') }}</p>
    <BottomNav />
  </main>
</template>

<style scoped>
.hist { padding-bottom: 120px; }
.hist__empty { padding: 40px var(--page-gutter); color: var(--ink-secondary); text-align: center; }
</style>
