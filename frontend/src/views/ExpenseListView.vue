<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import { useExpenseStore } from "@/stores/expense";

const { t } = useI18n();
const router = useRouter();
const store = useExpenseStore();

onMounted(async () => {
  await store.loadSummary();
  await store.loadMine();
});

const summary = computed(() => store.summary ?? { claimed: 0, pending: 0, approved: 0, paid: 0, count: 0 });

function variantFor(status: string, approval: string) {
  if (approval === "Approved") return "approved";
  if (approval === "Rejected") return "rejected";
  if (status === "Paid") return "paid";
  if (status === "Draft") return "draft";
  return "pending";
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
</script>

<template>
  <main class="elist">
    <TopAppBar :title="t('expense.title_hub')" />
    <SyncBar />

    <!-- Totals -->
    <section class="elist__totals" aria-label="Totals">
      <div class="elist__tile elist__tile--primary">
        <span class="elist__tile-label">{{ t('expense.claimed') }}</span>
        <span class="elist__tile-value">{{ fmtMoney(summary.claimed) }}</span>
      </div>
      <div class="elist__tile">
        <span class="elist__tile-label">{{ t('expense.pending') }}</span>
        <span class="elist__tile-value">{{ fmtMoney(summary.pending) }}</span>
      </div>
    </section>
    <section class="elist__totals elist__totals--secondary">
      <div class="elist__mini">
        <span class="elist__mini-label">{{ t('expense.approved') }}</span>
        <span class="elist__mini-value">{{ fmtMoney(summary.approved) }}</span>
      </div>
      <div class="elist__mini">
        <span class="elist__mini-label">{{ t('expense.paid') }}</span>
        <span class="elist__mini-value">{{ fmtMoney(summary.paid) }}</span>
      </div>
    </section>

    <!-- CTA -->
    <AppButton class="elist__cta" block @click="router.push('/expense/new')">
      {{ t('expense.new_claim') }}
    </AppButton>

    <!-- List -->
    <section class="elist__section">
      <h2>{{ t('expense.recent') }}</h2>
      <div v-if="store.mine.length" class="elist__rows">
        <button
          v-for="r in store.mine"
          :key="r.name"
          type="button"
          class="elist__row"
        >
          <span class="elist__row-body">
            <span class="elist__row-title">{{ r.name }}</span>
            <span class="elist__row-sub">{{ r.posting_date }}</span>
          </span>
          <span class="elist__row-amt">{{ fmtMoney(r.total_claimed_amount) }}</span>
          <Chip :variant="variantFor(r.status, r.approval_status)">
            {{ r.approval_status || r.status }}
          </Chip>
        </button>
      </div>
      <p v-else class="elist__empty">{{ t('expense.empty') }}</p>
    </section>

    <BottomNav />
  </main>
</template>

<style scoped>
.elist { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }

.elist__totals { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.elist__totals--secondary { margin-top: -4px; }

.elist__tile {
  background: var(--bg-surface);
  border-radius: var(--r-lg);
  box-shadow: var(--e-1);
  padding: 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.elist__tile--primary { background: var(--ink-primary); color: var(--bg-canvas); box-shadow: var(--e-2); }
.elist__tile--primary .elist__tile-label { color: var(--bg-sunk); opacity: 0.7; }

.elist__tile-label {
  font-size: 11px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-secondary);
}
.elist__tile-value {
  font-family: var(--font-mono); font-size: 22px;
  font-weight: 500; letter-spacing: -0.01em;
}

.elist__mini {
  background: var(--bg-sunk); border-radius: var(--r-md);
  padding: 10px 12px; display: flex; justify-content: space-between; align-items: baseline;
}
.elist__mini-label {
  font-size: 11px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--ink-secondary);
}
.elist__mini-value { font-family: var(--font-mono); font-size: 14px; color: var(--ink-primary); }

.elist__cta {
  background: var(--ink-primary); color: var(--bg-canvas);
  border-radius: var(--r-full); height: 52px; font-weight: 500;
}

.elist__section h2 {
  font-family: var(--font-display); font-weight: 500; font-size: 17px;
  letter-spacing: -0.01em; margin: 4px 0 10px; color: var(--ink-primary);
}
.elist__rows {
  background: var(--bg-surface); border-radius: var(--r-lg);
  box-shadow: var(--e-1); overflow: hidden;
}
.elist__row {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 14px; background: transparent; border: 0; text-align: left;
}
.elist__row + .elist__row { border-top: 1px solid var(--hairline); }
.elist__row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.elist__row-title { font-size: 14px; color: var(--ink-primary); font-weight: 500; }
.elist__row-sub { font-size: 12px; color: var(--ink-secondary); }
.elist__row-amt { font-family: var(--font-mono); font-size: 14px; color: var(--ink-primary); }

.elist__empty { color: var(--ink-secondary); text-align: center; padding: 40px 0; margin: 0; }
</style>
