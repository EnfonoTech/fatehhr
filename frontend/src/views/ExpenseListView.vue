<script setup lang="ts">
import { onMounted, computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import { useExpenseStore } from "@/stores/expense";
import { expenseApi, type ExpenseClaimDetail, type ExpenseClaimRow } from "@/api/expense";

const { t } = useI18n();
const router = useRouter();
const store = useExpenseStore();

onMounted(async () => {
  await store.loadSummary();
  await store.loadMine();
});

const summary = computed(() => store.summary ?? { claimed: 0, pending: 0, approved: 0, paid: 0, count: 0 });

const selected = ref<ExpenseClaimRow | null>(null);
const detail = ref<ExpenseClaimDetail | null>(null);
const detailBusy = ref(false);
const detailError = ref<string | null>(null);

async function openDetail(row: ExpenseClaimRow) {
  selected.value = row;
  detail.value = null;
  detailError.value = null;
  detailBusy.value = true;
  try {
    detail.value = await expenseApi.detail(row.name);
  } catch (e) {
    detailError.value = (e as Error)?.message ?? "error";
  } finally {
    detailBusy.value = false;
  }
}

function closeDetail() {
  selected.value = null;
  detail.value = null;
  detailError.value = null;
}

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
          @click="openDetail(r)"
        >
          <span class="elist__row-body">
            <span class="elist__row-title">{{ r.name }}</span>
            <span class="elist__row-sub">{{ r.posting_date }}</span>
          </span>
          <span class="elist__row-amt">{{ fmtMoney(r.total_claimed_amount) }}</span>
          <Chip :variant="variantFor(r.status, r.approval_status)">
            {{ r.approval_status || r.status }}
          </Chip>
          <span class="elist__row-chev" aria-hidden="true">›</span>
        </button>
      </div>
      <p v-else class="elist__empty">{{ t('expense.empty') }}</p>
    </section>

    <!-- Detail sheet -->
    <BottomSheet :open="!!selected" :title="selected?.name" @close="closeDetail">
      <template v-if="selected">
        <p v-if="detailBusy" class="elist__detail-msg">{{ t('more.loading') }}</p>
        <p v-else-if="detailError" class="elist__detail-msg">{{ detailError }}</p>
        <template v-else-if="detail">
          <dl class="elist__dl">
            <div>
              <dt>{{ t('expense.date') }}</dt>
              <dd>{{ detail.posting_date }}</dd>
            </div>
            <div>
              <dt>{{ t('leave.status_label') }}</dt>
              <dd>
                <Chip :variant="variantFor(detail.status, detail.approval_status)">
                  {{ detail.approval_status || detail.status }}
                </Chip>
              </dd>
            </div>
            <div>
              <dt>{{ t('expense.claimed') }}</dt>
              <dd class="elist__dl-mono">{{ fmtMoney(detail.total_claimed_amount) }}</dd>
            </div>
            <div v-if="detail.total_sanctioned_amount">
              <dt>{{ t('expense.approved') }}</dt>
              <dd class="elist__dl-mono">{{ fmtMoney(detail.total_sanctioned_amount) }}</dd>
            </div>
          </dl>
          <h4 class="elist__lines-head">{{ t('expense.total') }}</h4>
          <ul class="elist__lines">
            <li v-for="(ln, i) in detail.lines" :key="i" class="elist__line">
              <div class="elist__line-top">
                <span class="elist__line-type">{{ ln.expense_type }}</span>
                <span class="elist__line-amt">{{ fmtMoney(ln.amount) }}</span>
              </div>
              <div class="elist__line-sub">
                <span>{{ ln.expense_date }}</span>
                <span v-if="ln.description"> · {{ ln.description }}</span>
              </div>
            </li>
          </ul>
        </template>
      </template>
    </BottomSheet>

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
.elist__row-chev { color: var(--ink-tertiary); font-size: 18px; }
[dir="rtl"] .elist__row-chev { transform: scaleX(-1); }

.elist__detail-msg {
  color: var(--ink-secondary); text-align: center; padding: 20px 0; margin: 0;
}
.elist__dl { margin: 0 0 16px; display: flex; flex-direction: column; gap: 10px; }
.elist__dl > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.elist__dl dt {
  font-size: 12px; color: var(--ink-secondary);
  text-transform: uppercase; letter-spacing: .04em;
}
.elist__dl dd { margin: 0; font-size: 14px; color: var(--ink-primary); text-align: right; }
.elist__dl-mono { font-family: var(--font-mono); }
[dir="rtl"] .elist__dl dd { text-align: left; }

.elist__lines-head {
  font-family: var(--font-display); font-weight: 500; font-size: 14px;
  letter-spacing: .04em; text-transform: uppercase; color: var(--ink-secondary);
  margin: 4px 0 8px;
}
.elist__lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.elist__line {
  background: var(--bg-sunk); border-radius: var(--r-md); padding: 10px 12px;
  display: flex; flex-direction: column; gap: 4px;
}
.elist__line-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.elist__line-type { font-size: 14px; color: var(--ink-primary); font-weight: 500; }
.elist__line-amt { font-family: var(--font-mono); font-size: 14px; color: var(--ink-primary); }
.elist__line-sub { font-size: 12px; color: var(--ink-secondary); }
</style>
