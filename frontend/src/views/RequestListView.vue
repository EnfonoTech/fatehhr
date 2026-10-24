<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import SegmentedControl from "@/components/SegmentedControl.vue";
import { requestApi, type RequestRow } from "@/api/request";
import { useRequestStore } from "@/stores/request";

const { t } = useI18n();
const router = useRouter();
const store = useRequestStore();
const tab = ref<"mine" | "waiting">("mine");
const raised = ref<RequestRow[]>([]);
const waiting = ref<RequestRow[]>([]);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const r = await requestApi.mine();
    raised.value = r.raised;
    waiting.value = r.waiting;
    store.waiting = r.waiting.length;
    if (r.waiting.length && !r.raised.length) tab.value = "waiting";
  } catch (e) {
    error.value = (e as Error).message;
  }
});

const rows = computed(() => (tab.value === "mine" ? raised.value : waiting.value));
const options = computed(() => [
  { label: t("request.mine"), value: "mine" },
  { label: `${t("request.waiting")}${waiting.value.length ? ` (${waiting.value.length})` : ""}`, value: "waiting" },
]);

function variant(s: string) {
  return s === "Completed" ? "approved" : s === "Rejected" ? "rejected" : "pending";
}
</script>

<template>
  <main class="rq">
    <TopAppBar :title="t('request.title')" back @back="router.push('/')" />
    <div class="rq__tabs"><SegmentedControl v-model="tab" :options="options" /></div>
    <p v-if="error" class="rq__empty">{{ error }}</p>
    <p v-else-if="!rows.length" class="rq__empty">{{ tab === "mine" ? t("request.empty_mine") : t("request.empty_waiting") }}</p>
    <ul v-else class="rq__list">
      <li v-for="r in rows" :key="r.name" class="rq__row" @click="router.push(`/request/${encodeURIComponent(r.name)}`)">
        <div class="rq__row-main">
          <strong>{{ r.subject }}</strong>
          <span class="rq__sub">
            {{ tab === "waiting" ? `${t("request.by")} ${r.employee_name ?? ""}` : r.status === "Open" ? `${t("request.with")} ${r.holder_name ?? "—"}` : "" }}
            · {{ r.name }}
          </span>
        </div>
        <Chip :variant="variant(r.status)" dot>{{ t(`request.status_${r.status}`) }}</Chip>
      </li>
    </ul>
    <div class="rq__cta"><AppButton block @click="router.push('/request/new')">{{ t("request.new") }}</AppButton></div>
    <BottomNav />
  </main>
</template>

<style scoped>
.rq { padding: 0 var(--page-gutter) 140px; display: flex; flex-direction: column; gap: 12px; }
.rq__tabs { display: flex; }
.rq__empty { color: var(--ink-secondary); text-align: center; padding: 32px 0; }
.rq__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.rq__row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px;
  background: var(--bg-surface); box-shadow: var(--e-1); border-radius: var(--r-lg); cursor: pointer;
}
.rq__row:active { background: var(--bg-sunk); }
.rq__row-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rq__row-main strong { font-weight: 600; overflow-wrap: anywhere; }
.rq__sub { font-size: 12px; color: var(--ink-secondary); }
.rq__cta { position: fixed; left: var(--page-gutter); right: var(--page-gutter); bottom: calc(76px + env(safe-area-inset-bottom)); }
</style>
