<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import DateRangePicker from "@/components/DateRangePicker.vue";
import { useLeaveStore } from "@/stores/leave";

const { t } = useI18n();
const router = useRouter();
const store = useLeaveStore();

const leaveType = ref("");
const fromDate = ref<string>(new Date().toISOString().slice(0, 10));
const toDate = ref<string>(new Date().toISOString().slice(0, 10));
const halfDay = ref<0 | 1>(0);
const reason = ref("");
const busy = ref(false);
const message = ref<string | null>(null);

onMounted(async () => {
  await store.loadTypes();
  if (!leaveType.value && store.types.length) {
    leaveType.value = store.types[0].leave_type;
  }
});

const selectedBalance = computed(
  () => store.types.find((x) => x.leave_type === leaveType.value)?.balance ?? 0,
);

async function submit() {
  busy.value = true;
  message.value = null;
  try {
    const res = await store.apply({
      leave_type: leaveType.value,
      from_date: fromDate.value,
      to_date: toDate.value,
      half_day: halfDay.value,
      reason: reason.value,
    });
    message.value = res.mode === "online" ? t("leave.submitted") : t("leave.queued");
    reason.value = "";
    setTimeout(() => router.push("/leave"), 600);
  } catch (e) {
    message.value = (e as Error)?.message ?? "error";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="leave-apply">
    <TopAppBar :title="t('leave.request_a_leave')" back @back="router.back()" />
    <SyncBar />

    <form class="leave-apply__form" @submit.prevent="submit">
      <label>
        <span>{{ t("leave.type") }}</span>
        <select v-model="leaveType" class="leave-apply__select">
          <option v-for="tt in store.types" :key="tt.leave_type" :value="tt.leave_type">
            {{ tt.label }} — {{ tt.balance.toFixed(1) }} {{ t("leave.days_left") }}
          </option>
        </select>
      </label>

      <DateRangePicker v-model:from="fromDate" v-model:to="toDate" />

      <label class="leave-apply__half">
        <input
          type="checkbox"
          :checked="halfDay === 1"
          @change="halfDay = ($event.target as HTMLInputElement).checked ? 1 : 0"
        />
        <span>{{ t("leave.half_day") }}</span>
      </label>

      <label>
        <span>{{ t("leave.reason") }}</span>
        <textarea v-model="reason" rows="3" />
      </label>

      <Card class="leave-apply__balance">
        <h3>{{ t("leave.balance_card") }}</h3>
        <p class="leave-apply__balance-num">
          {{ selectedBalance.toFixed(1) }} {{ t("leave.days_left") }}
        </p>
      </Card>

      <AppButton block type="submit" :disabled="busy">{{ t("leave.submit") }}</AppButton>
      <p v-if="message" class="leave-apply__msg">{{ message }}</p>
    </form>

    <BottomNav />
  </main>
</template>

<style scoped>
.leave-apply { padding: 0 var(--page-gutter) 120px; }
.leave-apply__tabs { display: flex; gap: 8px; margin: 8px 0 16px; }
.leave-apply__tabs .tab {
  padding: 8px 14px; font-size: 13px; border-radius: var(--r-md);
  background: var(--bg-sunk); color: var(--ink-secondary); text-decoration: none;
}
.leave-apply__tabs .tab.is-active,
.leave-apply__tabs .tab.router-link-exact-active {
  background: var(--bg-surface); box-shadow: var(--e-1); color: var(--ink-primary);
}
.leave-apply__form { display: flex; flex-direction: column; gap: 14px; }
.leave-apply__form label { display: flex; flex-direction: column; gap: 6px; }
.leave-apply__form label span {
  font-size: 12px; color: var(--ink-secondary);
  text-transform: uppercase; letter-spacing: .04em;
}
.leave-apply__form select, .leave-apply__form textarea {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md);
  padding: 12px; font-size: 15px; color: var(--ink-primary);
}
.leave-apply__half { flex-direction: row !important; align-items: center; gap: 10px; }
.leave-apply__balance h3 {
  font-family: var(--font-display); font-weight: 400; font-size: 17px; margin: 0 0 4px;
}
.leave-apply__balance-num { font-family: var(--font-mono); font-size: 24px; margin: 0; }
.leave-apply__msg { color: var(--ink-secondary); font-size: 13px; }
</style>
