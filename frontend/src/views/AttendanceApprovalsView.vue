<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Chip from "@/components/Chip.vue";
import Icon from "@/components/Icon.vue";
import { useApprovalsStore } from "@/stores/approvals";
import type { ApprovalRow } from "@/api/approvals";

const { t } = useI18n();
const router = useRouter();
const store = useApprovalsStore();

const tab = ref<"pending" | "done">("pending");
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

function initials(name: string | null, fallback: string): string {
  const src = (name || fallback || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
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

function windowLeft(iso: string | null): { text: string; expired: boolean } | null {
  if (!iso) return null;
  const exp = new Date(iso).getTime();
  if (Number.isNaN(exp)) return null;
  const ms = exp - now.value;
  if (ms <= 0) return { text: t("approvals.window_expired"), expired: true };
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { text: t("approvals.window_left", { time: h > 0 ? `${h}h ${m}m` : `${m}m` }), expired: false };
}
</script>

<template>
  <main class="appr">
    <TopAppBar :title="t('approvals.title')" back @back="router.back()" />
    <SyncBar />

    <!-- Segmented control -->
    <div class="seg" role="tablist">
      <button
        class="seg__opt"
        :class="{ 'is-active': tab === 'pending' }"
        role="tab"
        @click="tab = 'pending'"
      >
        {{ t('approvals.pending') }}
        <span v-if="store.summary.pending_count" class="seg__badge">{{ store.summary.pending_count }}</span>
      </button>
      <button
        class="seg__opt"
        :class="{ 'is-active': tab === 'done' }"
        role="tab"
        @click="tab = 'done'"
      >
        {{ t('approvals.done') }}
      </button>
    </div>

    <!-- PENDING -->
    <template v-if="tab === 'pending'">
      <button v-for="r in store.pending" :key="r.name" class="ac" @click="open(r)">
        <span class="ac__avatar">{{ initials(r.employee_name, r.employee) }}</span>
        <span class="ac__body">
          <span class="ac__top">
            <span class="ac__name">{{ r.employee_name || r.employee }}</span>
            <Chip
              v-if="windowLeft(r.window_expires_at)"
              :variant="windowLeft(r.window_expires_at)!.expired ? 'rejected' : 'neutral'"
            >{{ windowLeft(r.window_expires_at)!.text }}</Chip>
          </span>
          <span class="ac__sub">
            {{ r.attendance_date || '—' }} · {{ fmtHM(r.in_time) }} → {{ fmtHM(r.out_time) }}
            <template v-if="r.working_hours"> · {{ t('approvals.hours_short', { n: r.working_hours.toFixed(1) }) }}</template>
          </span>
          <span class="ac__chips">
            <Chip variant="pending">{{ t('approvals.level_of', { n: r.current_approval_level || 1 }) }}</Chip>
          </span>
        </span>
        <Icon name="chevron-right" :size="18" class="ac__chev" />
      </button>
      <div v-if="!store.loading && !store.pending.length" class="appr__empty">
        <Icon name="approvals" :size="40" />
        <p>{{ t('approvals.empty_pending') }}</p>
      </div>
    </template>

    <!-- DONE -->
    <template v-else>
      <button v-for="r in store.done" :key="r.name" class="ac" @click="open(r)">
        <span class="ac__avatar">{{ initials(r.employee_name, r.employee) }}</span>
        <span class="ac__body">
          <span class="ac__top">
            <span class="ac__name">{{ r.employee_name || r.employee }}</span>
            <Chip :variant="approvalVariant(r.workflow_state)">{{ r.workflow_state }}</Chip>
          </span>
          <span class="ac__sub">
            {{ r.attendance_date || '—' }} · {{ fmtHM(r.in_time) }} → {{ fmtHM(r.out_time) }}
            <template v-if="r.working_hours"> · {{ t('approvals.hours_short', { n: r.working_hours.toFixed(1) }) }}</template>
          </span>
        </span>
        <Icon name="chevron-right" :size="18" class="ac__chev" />
      </button>
      <div v-if="!store.done.length" class="appr__empty">
        <Icon name="approvals" :size="40" />
        <p>{{ t('approvals.empty_done') }}</p>
      </div>
    </template>

    <BottomNav />
  </main>
</template>

<style scoped>
.appr { padding: 0 var(--page-gutter) 120px; }

/* Segmented control */
.seg {
  display: flex; gap: 4px; padding: 4px; margin: 10px 0 16px;
  background: var(--bg-sunk); border-radius: var(--r-full);
}
.seg__opt {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 0; border: 0; cursor: pointer; font: inherit; font-size: 14px; font-weight: 500;
  border-radius: var(--r-full); background: transparent; color: var(--ink-secondary);
  transition: background var(--m-micro), color var(--m-micro);
}
.seg__opt.is-active { background: var(--bg-surface); color: var(--ink-primary); box-shadow: var(--e-1); }
.seg__badge {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--r-full);
  background: var(--accent); color: var(--accent-ink);
  font-size: 11px; font-weight: 600; display: grid; place-items: center;
}

/* Approval card */
.ac {
  width: 100%; display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; margin-bottom: 10px;
  background: var(--bg-surface); border: 0; border-radius: var(--r-lg); box-shadow: var(--e-1);
  text-align: start; cursor: pointer; font: inherit;
  transition: transform 120ms ease, background 120ms ease;
}
.ac:active { transform: scale(0.99); background: var(--bg-sunk); }
.ac__avatar {
  width: 42px; height: 42px; flex-shrink: 0; border-radius: var(--r-full);
  display: grid; place-items: center;
  background: var(--accent-soft, #e2efec); color: var(--accent, #2E5D5A);
  font-family: var(--font-display); font-weight: 600; font-size: 15px;
}
.ac__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ac__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ac__name {
  font-size: 15px; font-weight: 600; color: var(--ink-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ac__sub {
  font-size: 12.5px; color: var(--ink-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ac__chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.ac__chev { color: var(--ink-tertiary); flex-shrink: 0; }
[dir="rtl"] .ac__chev { transform: scaleX(-1); }

.appr__empty {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 56px 24px; color: var(--ink-tertiary); text-align: center;
}
.appr__empty p { margin: 0; font-size: 14px; color: var(--ink-secondary); }
</style>
