<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import ListRow from "@/components/ListRow.vue";
import Chip from "@/components/Chip.vue";
import { useApprovalsStore } from "@/stores/approvals";
import type { ApprovalRow } from "@/api/approvals";

const { t } = useI18n();
const router = useRouter();
const store = useApprovalsStore();

const tab = ref<"pending" | "done">("pending");
// Ticks once a minute so the "time left" chips stay roughly current without a
// per-second timer. Captured reactively; cleaned up on unmount.
const now = ref(Date.now());
let tick: number | null = null;

onMounted(async () => {
  await store.loadSummary();
  await Promise.all([store.loadPending(), store.loadDone()]);
  tick = window.setInterval(() => (now.value = Date.now()), 60_000);
});
onUnmounted(() => {
  if (tick) clearInterval(tick);
});

function open(row: ApprovalRow) {
  router.push(`/approvals/${encodeURIComponent(row.name)}`);
}

function fmtHM(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function approvalVariant(state: string | null): "pending" | "approved" | "rejected" | "neutral" {
  if (!state) return "neutral";
  if (state.includes("Pending")) return "pending";
  if (state === "Approved") return "approved";
  if (state === "Rejected") return "rejected";
  return "neutral";
}

/** Human "time left" until the approval window expires. */
function windowLeft(iso: string | null): { text: string; expired: boolean } | null {
  if (!iso) return null;
  const exp = new Date(iso).getTime();
  if (Number.isNaN(exp)) return null;
  const ms = exp - now.value;
  if (ms <= 0) return { text: t("approvals.window_expired"), expired: true };
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const span = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { text: t("approvals.window_left", { time: span }), expired: false };
}
</script>

<template>
  <main class="appr">
    <TopAppBar :title="t('approvals.title')" back @back="router.back()" />
    <SyncBar />

    <div class="appr__tabs">
      <button class="tab" :class="{ 'is-active': tab === 'pending' }" @click="tab = 'pending'">
        {{ t('approvals.pending') }}
        <span v-if="store.summary.pending_count" class="tab__count">{{ store.summary.pending_count }}</span>
      </button>
      <button class="tab" :class="{ 'is-active': tab === 'done' }" @click="tab = 'done'">
        {{ t('approvals.done') }}
      </button>
    </div>

    <template v-if="tab === 'pending'">
      <div v-for="r in store.pending" :key="r.name" class="appr__row" @click="open(r)">
        <ListRow
          :title="r.employee_name || r.employee"
          :subtitle="`${r.attendance_date || '—'} · ${fmtHM(r.in_time)} → ${fmtHM(r.out_time)}`"
        />
        <div class="appr__meta">
          <Chip :variant="approvalVariant(r.workflow_state)">
            {{ t('approvals.level', { n: r.current_approval_level || 1 }) }}
          </Chip>
          <Chip
            v-if="windowLeft(r.window_expires_at)"
            :variant="windowLeft(r.window_expires_at)!.expired ? 'rejected' : 'neutral'"
          >
            {{ windowLeft(r.window_expires_at)!.text }}
          </Chip>
        </div>
      </div>
      <p v-if="!store.loading && !store.pending.length" class="appr__empty">
        {{ t('approvals.empty_pending') }}
      </p>
    </template>

    <template v-else>
      <div v-for="r in store.done" :key="r.name" class="appr__row" @click="open(r)">
        <ListRow
          :title="r.employee_name || r.employee"
          :subtitle="`${r.attendance_date || '—'} · ${fmtHM(r.in_time)} → ${fmtHM(r.out_time)}`"
        />
        <div class="appr__meta">
          <Chip :variant="approvalVariant(r.workflow_state)">{{ r.workflow_state }}</Chip>
        </div>
      </div>
      <p v-if="!store.done.length" class="appr__empty">{{ t('approvals.empty_done') }}</p>
    </template>

    <BottomNav />
  </main>
</template>

<style scoped>
.appr { padding: 0 var(--page-gutter) 120px; }
.appr__tabs { display: flex; gap: 8px; margin: 8px 0 16px; }
.appr__tabs .tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; font: inherit; font-size: 13px; border: 0; cursor: pointer;
  border-radius: var(--r-md); background: var(--bg-sunk); color: var(--ink-secondary);
}
.appr__tabs .tab.is-active {
  background: var(--bg-surface); box-shadow: var(--e-1); color: var(--ink-primary);
}
.tab__count {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--r-full);
  background: var(--accent); color: var(--accent-ink);
  font-size: 11px; display: grid; place-items: center;
}
.appr__row { padding-bottom: 8px; cursor: pointer; }
.appr__meta { display: flex; align-items: center; gap: 8px; padding: 4px 0 12px; flex-wrap: wrap; }
.appr__empty { padding: 40px 0; color: var(--ink-secondary); text-align: center; }
</style>
