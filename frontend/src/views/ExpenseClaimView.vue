<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import PhotoSlot from "@/components/PhotoSlot.vue";
import AmountDisplay from "@/components/AmountDisplay.vue";
import { useExpenseStore, type DraftLine } from "@/stores/expense";

const { t } = useI18n();
const router = useRouter();
const store = useExpenseStore();

const lines = ref<DraftLine[]>([{
  expense_type: "",
  expense_date: new Date().toISOString().slice(0, 10),
  amount: 0,
  description: "",
  receipt_photo_id: null,
}]);
const busy = ref(false);
const msg = ref<string | null>(null);

function addLine() {
  lines.value.push({
    expense_type: "",
    expense_date: new Date().toISOString().slice(0, 10),
    amount: 0,
    description: "",
    receipt_photo_id: null,
  });
}
function removeLine(i: number) { lines.value.splice(i, 1); }

const total = computed(() =>
  lines.value.reduce((a, l) => a + Number(l.amount || 0), 0),
);

async function submit() {
  if (!lines.value.every((l) => l.receipt_photo_id)) {
    msg.value = t("expense.receipt_required");
    return;
  }
  busy.value = true;
  msg.value = null;
  try {
    const res = await store.submit(lines.value);
    msg.value = res.mode === "online" ? t("expense.submitted") : t("expense.queued");
    if (res.mode === "online") {
      lines.value = [{
        expense_type: "",
        expense_date: new Date().toISOString().slice(0, 10),
        amount: 0,
        description: "",
        receipt_photo_id: null,
      }];
    }
  } catch (e) {
    msg.value = (e as Error)?.message || "error";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="expense">
    <TopAppBar :title="t('expense.title')" back @back="router.back()" />
    <SyncBar />

    <Card v-for="(ln, i) in lines" :key="i" class="expense__line">
      <label><span>{{ t('expense.type') }}</span>
        <input v-model="ln.expense_type" type="text" placeholder="e.g. Travel" /></label>
      <label><span>{{ t('expense.date') }}</span>
        <input v-model="ln.expense_date" type="date" /></label>
      <label><span>{{ t('expense.amount') }}</span>
        <input v-model.number="ln.amount" type="number" step="0.01" min="0" /></label>
      <label><span>{{ t('expense.description') }}</span>
        <input v-model="ln.description" type="text" /></label>
      <div>
        <span class="expense__label">{{ t('expense.receipt') }} *</span>
        <PhotoSlot v-model="ln.receipt_photo_id" aspect="3:4" />
      </div>
      <button
        class="expense__remove"
        type="button"
        v-if="lines.length > 1"
        @click="removeLine(i)"
      >{{ t('expense.remove_line') }}</button>
    </Card>

    <AppButton variant="ghost" block @click="addLine">+ {{ t('expense.add_line') }}</AppButton>

    <Card class="expense__total">
      <span>{{ t('expense.total') }}</span>
      <AmountDisplay :amount="total" currency="SAR" />
    </Card>

    <AppButton block :disabled="busy" @click="submit">{{ t('expense.submit') }}</AppButton>
    <p v-if="msg" class="expense__msg">{{ msg }}</p>

    <RouterLink to="/expense/mine" class="expense__history">{{ t('expense.mine') }} →</RouterLink>
    <BottomNav />
  </main>
</template>

<style scoped>
.expense { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.expense__line { display: flex; flex-direction: column; gap: 10px; }
.expense__line label { display: flex; flex-direction: column; gap: 4px; }
.expense__line label span, .expense__label {
  font-size: 12px; color: var(--ink-secondary);
  text-transform: uppercase; letter-spacing: .04em;
}
.expense__line input {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md);
  padding: 12px; font-size: 15px; color: var(--ink-primary);
}
.expense__remove { color: var(--danger); font-size: 13px; align-self: flex-start; padding: 4px 0; }
.expense__total { display: flex; align-items: center; justify-content: space-between; }
.expense__history { display: block; margin-top: 12px; color: var(--ink-secondary); text-align: center; }
.expense__msg { color: var(--ink-secondary); font-size: 13px; text-align: center; }
</style>
