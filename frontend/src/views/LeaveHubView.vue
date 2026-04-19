<script setup lang="ts">
import { onMounted, computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import GaugeCard from "@/components/GaugeCard.vue";
import Icon from "@/components/Icon.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import { useLeaveStore } from "@/stores/leave";
import type { LeaveRow } from "@/api/leave";

const { t } = useI18n();
const router = useRouter();
const store = useLeaveStore();

const selected = ref<LeaveRow | null>(null);

onMounted(async () => {
  await store.loadTypes();
  await store.loadMine();
});

// Only show leave types with an allocation so we don't overwhelm with empties.
const balanceCards = computed(() =>
  store.types.filter((t) => (t.total ?? 0) > 0).slice(0, 6),
);

const recentLeaves = computed(() => store.mine.slice(0, 5));

function variantFor(status: string) {
  const m: Record<string, "pending" | "approved" | "rejected" | "draft" | "neutral"> = {
    Open: "pending",
    Approved: "approved",
    Rejected: "rejected",
    Cancelled: "draft",
  };
  return m[status] ?? "neutral";
}

function fmtDate(d: string) {
  // "YYYY-MM-DD" → "DD MMM"
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function rangeOrSingle(r: LeaveRow): string {
  if (r.from_date === r.to_date) {
    return `${fmtDate(r.from_date)} · ${r.total_leave_days}d`;
  }
  return `${fmtDate(r.from_date)} – ${fmtDate(r.to_date)} · ${r.total_leave_days}d`;
}

async function cancelSelected() {
  if (!selected.value) return;
  if (!confirm(t("leave.cancel_confirm"))) return;
  try {
    await store.cancel(selected.value.name);
    selected.value = null;
  } catch (e) {
    alert((e as Error)?.message || "error");
  }
}
</script>

<template>
  <main class="lhub">
    <TopAppBar :title="t('leave.title_hub')" />
    <SyncBar />

    <!-- Balance cards -->
    <section class="lhub__balance">
      <div class="lhub__balance-head">
        <h2>{{ t("leave.balance_title") }}</h2>
        <RouterLink to="/leave/mine" class="lhub__link">{{ t("leave.view_history") }}</RouterLink>
      </div>
      <div v-if="balanceCards.length" class="lhub__gauges">
        <GaugeCard
          v-for="b in balanceCards"
          :key="b.leave_type"
          :label="`${b.label} ${t('leave.balance_suffix')}`"
          :balance="b.balance"
          :total="b.total"
        />
      </div>
      <p v-else class="lhub__empty-balance">{{ t("leave.no_allocation") }}</p>
    </section>

    <!-- Request CTA -->
    <AppButton class="lhub__cta" block @click="router.push('/leave/apply')">
      {{ t("leave.request_a_leave") }}
    </AppButton>

    <!-- Recent Leaves -->
    <section class="lhub__recent">
      <h2>{{ t("leave.recent") }}</h2>
      <div v-if="recentLeaves.length" class="lhub__rows">
        <button
          v-for="r in recentLeaves"
          :key="r.name"
          type="button"
          class="lhub__row"
          @click="selected = r"
        >
          <span class="lhub__row-icon" aria-hidden="true">
            <Icon name="leave" :size="18" />
          </span>
          <span class="lhub__row-body">
            <span class="lhub__row-title">{{ r.leave_type }}</span>
            <span class="lhub__row-sub">{{ rangeOrSingle(r) }}</span>
          </span>
          <Chip :variant="variantFor(r.status)">{{ r.status }}</Chip>
          <span class="lhub__row-chev" aria-hidden="true">›</span>
        </button>
      </div>
      <p v-else class="lhub__empty">{{ t("leave.empty") }}</p>
      <RouterLink v-if="store.mine.length > 5" to="/leave/mine" class="lhub__viewlist">
        {{ t("leave.view_list") }}
      </RouterLink>
    </section>

    <!-- Pending-sync drafts -->
    <section v-if="store.pendingLocal.length" class="lhub__recent">
      <h2>{{ t("leave.pending_local") }}</h2>
      <div class="lhub__rows">
        <div v-for="p in store.pendingLocal" :key="p.draftId" class="lhub__row lhub__row--pending">
          <span class="lhub__row-icon" aria-hidden="true">
            <Icon name="leave" :size="18" />
          </span>
          <span class="lhub__row-body">
            <span class="lhub__row-title">{{ p.leave_type }}</span>
            <span class="lhub__row-sub">{{ fmtDate(p.from_date) }} – {{ fmtDate(p.to_date) }}</span>
          </span>
          <Chip variant="pending">{{ t("leave.pending_sync") }}</Chip>
        </div>
      </div>
    </section>

    <!-- Detail sheet -->
    <BottomSheet :open="!!selected" :title="selected?.leave_type" @close="selected = null">
      <template v-if="selected">
        <dl class="lhub__dl">
          <div><dt>{{ t("leave.type") }}</dt><dd>{{ selected.leave_type }}</dd></div>
          <div>
            <dt>{{ t("leave.period") }}</dt>
            <dd>{{ selected.from_date }} → {{ selected.to_date }}</dd>
          </div>
          <div><dt>{{ t("leave.days") }}</dt><dd>{{ selected.total_leave_days }}</dd></div>
          <div v-if="selected.half_day"><dt>{{ t("leave.half_day") }}</dt><dd>✓</dd></div>
          <div>
            <dt>{{ t("leave.status_label") }}</dt>
            <dd><Chip :variant="variantFor(selected.status)">{{ selected.status }}</Chip></dd>
          </div>
          <div v-if="selected.description">
            <dt>{{ t("leave.reason") }}</dt><dd>{{ selected.description }}</dd>
          </div>
        </dl>
        <AppButton
          v-if="selected.status === 'Open'"
          variant="destructive"
          block
          @click="cancelSelected"
        >{{ t("leave.cancel") }}</AppButton>
      </template>
    </BottomSheet>

    <BottomNav />
  </main>
</template>

<style scoped>
.lhub { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 16px; }

.lhub__balance-head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 12px;
}
.lhub__balance-head h2 {
  font-family: var(--font-display); font-weight: 500; font-size: 17px;
  letter-spacing: -0.01em; margin: 0; color: var(--ink-primary);
}
.lhub__link {
  font-size: 13px; color: var(--ink-primary);
  text-decoration: underline; text-underline-offset: 3px;
}
.lhub__gauges {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.lhub__gauges > :nth-child(n + 3) { grid-column: auto; }
.lhub__empty-balance {
  color: var(--ink-secondary); font-size: 13px; padding: 12px 0; margin: 0;
}

.lhub__cta {
  background: var(--ink-primary);
  color: var(--bg-canvas);
  border-radius: var(--r-full);
  height: 52px;
  font-weight: 500;
}

.lhub__recent h2 {
  font-family: var(--font-display); font-weight: 500; font-size: 17px;
  letter-spacing: -0.01em; margin: 4px 0 10px; color: var(--ink-primary);
}
.lhub__rows {
  background: var(--bg-surface);
  border-radius: var(--r-lg);
  box-shadow: var(--e-1);
  overflow: hidden;
}
.lhub__row {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 14px 14px;
  background: transparent; border: 0; cursor: pointer; text-align: left;
}
.lhub__row + .lhub__row { border-top: 1px solid var(--hairline); }
.lhub__row:active { background: var(--bg-sunk); }
.lhub__row--pending { cursor: default; }
.lhub__row-icon {
  width: 36px; height: 36px; display: grid; place-items: center;
  color: var(--accent, #2E5D5A);
  background: var(--accent-soft, #e8f0ee);
  border-radius: var(--r-md);
  flex-shrink: 0;
}
.lhub__row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.lhub__row-title {
  font-size: 14px; font-weight: 500; color: var(--ink-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.lhub__row-sub {
  font-size: 12px; color: var(--ink-secondary);
}
.lhub__row-chev { color: var(--ink-tertiary); font-size: 18px; }
[dir="rtl"] .lhub__row-chev { transform: scaleX(-1); }

.lhub__empty {
  color: var(--ink-secondary); text-align: center; padding: 20px 0; margin: 0;
}
.lhub__viewlist {
  display: block; text-align: center; padding: 10px 0; color: var(--ink-secondary);
  font-size: 13px;
}

.lhub__dl { margin: 0 0 12px; display: flex; flex-direction: column; gap: 10px; }
.lhub__dl > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.lhub__dl dt {
  font-size: 12px; color: var(--ink-secondary);
  text-transform: uppercase; letter-spacing: .04em;
}
.lhub__dl dd { margin: 0; font-size: 14px; color: var(--ink-primary); text-align: right; }
[dir="rtl"] .lhub__dl dd { text-align: left; }
</style>
