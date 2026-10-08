<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import DateRangePicker from "@/components/DateRangePicker.vue";
import PhotoSlot from "@/components/PhotoSlot.vue";
import { useLeaveStore } from "@/stores/leave";
import { leaveApi, type ClientApprovalReceived } from "@/api/leave";
import { errorMessage } from "@/api/client";
import { useSyncStore } from "@/stores/sync";

const { t } = useI18n();
const router = useRouter();
const store = useLeaveStore();
const sync = useSyncStore();

const leaveType = ref("");
const fromDate = ref<string>(new Date().toISOString().slice(0, 10));
const toDate = ref<string>(new Date().toISOString().slice(0, 10));
const halfDay = ref<0 | 1>(0);
const reason = ref("");
const busy = ref(false);
const message = ref<string | null>(null);

// Client approval (cooperheat sites only — store.clientApprovalEnabled).
const clientApprovalRequired = ref(false);
const clientApprovalReceived = ref<ClientApprovalReceived>("No");
const clientApprovalPhoto = ref<string | null>(null);

onMounted(async () => {
  await Promise.all([store.loadTypes(), store.loadFormConfig()]);
  if (!leaveType.value && store.types.length) {
    leaveType.value = store.types[0].leave_type;
  }
});

const selectedType = computed(() => store.types.find((x) => x.leave_type === leaveType.value));
const selectedBalance = computed(() => selectedType.value?.balance ?? 0);
/** LWP and allow-negative types are never blocked by balance (HRMS skips the check). */
const balanceExempt = computed(
  () => !!(selectedType.value?.is_lwp || selectedType.value?.allow_negative),
);

// Days HRMS will charge (holiday + half-day aware). null = unknown (offline /
// server error) — then only the zero-balance rule applies.
const requestedDays = ref<number | null>(null);
let daysReq = 0;
watch(
  [leaveType, fromDate, toDate, halfDay, () => sync.isOnline],
  async () => {
    const token = ++daysReq;
    requestedDays.value = null;
    if (!leaveType.value || !fromDate.value || !toDate.value || !sync.isOnline) return;
    try {
      const r = await leaveApi.leave_days({
        leave_type: leaveType.value,
        from_date: fromDate.value,
        to_date: toDate.value,
        half_day: halfDay.value,
      });
      if (token === daysReq) requestedDays.value = Number(r?.days ?? 0);
    } catch {
      /* keep null — server validation on submit is the backstop */
    }
  },
  { immediate: true },
);

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

const balanceWarning = computed<string | null>(() => {
  if (!selectedType.value || balanceExempt.value) return null;
  const bal = selectedBalance.value;
  if (bal <= 0) return t("leave.no_balance");
  if (requestedDays.value !== null && requestedDays.value > bal) {
    return t("leave.exceeds_balance", { req: fmt(requestedDays.value), bal: fmt(bal) });
  }
  return null;
});

const approvalWarning = computed<string | null>(() => {
  if (!store.clientApprovalEnabled || !clientApprovalRequired.value) return null;
  if (clientApprovalReceived.value === "Yes" && !clientApprovalPhoto.value) {
    return t("leave.client_approval_attach_needed");
  }
  return null;
});

const canSubmit = computed(
  () => !busy.value && !!leaveType.value && !balanceWarning.value && !approvalWarning.value,
);

async function submit() {
  if (!canSubmit.value) return;
  busy.value = true;
  message.value = null;
  try {
    const res = await store.apply({
      leave_type: leaveType.value,
      from_date: fromDate.value,
      to_date: toDate.value,
      half_day: halfDay.value,
      reason: reason.value,
      client_approval: store.clientApprovalEnabled
        ? {
            required: clientApprovalRequired.value ? "Yes" : "Not Required",
            received: clientApprovalReceived.value,
            photo_id: clientApprovalPhoto.value,
          }
        : null,
    });
    message.value = res.mode === "online" ? t("leave.submitted") : t("leave.queued");
    reason.value = "";
    setTimeout(() => router.push("/leave"), 600);
  } catch (e) {
    message.value = errorMessage(e, t("leave.submit_failed"));
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
            <template v-if="tt.is_lwp">{{ tt.label }} — {{ t("leave.unpaid") }}</template>
            <template v-else>{{ tt.label }} — {{ tt.balance.toFixed(1) }} {{ t("leave.days_left") }}</template>
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

      <section v-if="store.clientApprovalEnabled" class="leave-apply__client">
        <label class="leave-apply__half">
          <input v-model="clientApprovalRequired" type="checkbox" />
          <span>{{ t("leave.client_approval_required") }}</span>
        </label>
        <template v-if="clientApprovalRequired">
          <label>
            <span>{{ t("leave.client_approval_received") }}</span>
            <select v-model="clientApprovalReceived" class="leave-apply__select">
              <option value="No">{{ t("leave.no") }}</option>
              <option value="Yes">{{ t("leave.yes") }}</option>
            </select>
          </label>
          <div class="leave-apply__attach">
            <span>{{ t("leave.client_approval_attachment") }}</span>
            <PhotoSlot
              v-model="clientApprovalPhoto"
              aspect="16:9"
              :label="t('leave.client_approval_attach_cta')"
            />
          </div>
        </template>
      </section>

      <Card class="leave-apply__balance">
        <h3>{{ t("leave.balance_card") }}</h3>
        <p class="leave-apply__balance-num">
          <template v-if="selectedType?.is_lwp">{{ t("leave.unpaid") }}</template>
          <template v-else>{{ selectedBalance.toFixed(1) }} {{ t("leave.days_left") }}</template>
        </p>
        <p v-if="requestedDays !== null" class="leave-apply__requested">
          {{ t("leave.requested_days", { n: fmt(requestedDays) }) }}
        </p>
      </Card>

      <p v-if="balanceWarning" class="leave-apply__warn" role="alert">{{ balanceWarning }}</p>
      <p v-if="approvalWarning" class="leave-apply__warn" role="alert">{{ approvalWarning }}</p>

      <AppButton block type="submit" :disabled="!canSubmit">{{ t("leave.submit") }}</AppButton>
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
.leave-apply__msg { color: var(--ink-secondary); font-size: 13px; white-space: pre-line; }
.leave-apply__requested { margin: 6px 0 0; font-size: 13px; color: var(--ink-secondary); }
.leave-apply__warn {
  margin: 0; padding: 10px 12px; border-radius: var(--r-md);
  background: var(--warning-soft); color: var(--warning); font-size: 14px;
}
.leave-apply__client { display: flex; flex-direction: column; gap: 14px; }
.leave-apply__attach { display: flex; flex-direction: column; gap: 6px; }
.leave-apply__attach > span {
  font-size: 12px; color: var(--ink-secondary);
  text-transform: uppercase; letter-spacing: .04em;
}
</style>
