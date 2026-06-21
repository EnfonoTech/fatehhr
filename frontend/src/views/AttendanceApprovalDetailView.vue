<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import { ApiError } from "@/api/client";
import { useApprovalsStore } from "@/stores/approvals";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useApprovalsStore();

const name = String(route.params.name);
const editedIn = ref<string>("");   // datetime-local string
const editedOut = ref<string>("");
const reason = ref<string>("");
const armedApprove = ref(false);
const armedReject = ref(false);
const busy = ref(false);
const message = ref<string | null>(null);
const now = ref(Date.now());
let tick: number | null = null;

onMounted(async () => {
  try {
    await store.loadDetail(name);
    editedIn.value = toLocalInput(store.detail?.in_time ?? null);
    editedOut.value = toLocalInput(store.detail?.out_time ?? null);
  } catch (e) {
    message.value = e instanceof ApiError ? serverMessage(e) || t("approvals.not_yours") : t("approvals.online_only");
  }
  tick = window.setInterval(() => (now.value = Date.now()), 30_000);
});
onUnmounted(() => {
  if (tick) clearInterval(tick);
});

const d = computed(() => store.detail);

const isPending = computed(() => (d.value?.workflow_state || "").includes("Pending"));

const expired = computed(() => {
  const iso = d.value?.window_expires_at;
  if (!iso) return false;
  const exp = new Date(iso).getTime();
  return !Number.isNaN(exp) && exp <= now.value;
});

const canAct = computed(() => isPending.value && !expired.value);

const workedHours = computed(() => {
  const a = editedIn.value ? new Date(editedIn.value).getTime() : NaN;
  const b = editedOut.value ? new Date(editedOut.value).getTime() : NaN;
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return d.value?.working_hours ?? 0;
  return Math.round(((b - a) / 3_600_000) * 100) / 100;
});

function approvalVariant(state: string | null | undefined): "pending" | "approved" | "rejected" | "neutral" {
  if (!state) return "neutral";
  if (state.includes("Pending")) return "pending";
  if (state === "Approved") return "approved";
  if (state === "Rejected") return "rejected";
  return "neutral";
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

function toUtcIso(local: string): string | null {
  if (!local) return null;
  const dt = new Date(local); // parsed as device-local
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** Only send a time if the approver actually changed it (preserves seconds). */
function changed(localValue: string, originalIso: string | null): string | null {
  return localValue !== toLocalInput(originalIso) ? toUtcIso(localValue) : null;
}

function serverMessage(e: ApiError): string | null {
  const body = e.body as { _server_messages?: string; exception?: string } | undefined;
  try {
    if (body?._server_messages) {
      const arr = JSON.parse(body._server_messages) as string[];
      if (arr.length) {
        const m = JSON.parse(arr[0]) as { message?: string };
        return (m.message || "").replace(/<[^>]+>/g, "").trim() || null;
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function runAction(fn: () => Promise<unknown>, okKey: "approved_done" | "rejected_done") {
  busy.value = true;
  message.value = null;
  try {
    await fn();
    message.value = t(`approvals.${okKey}`);
    window.setTimeout(() => router.replace("/approvals"), 800);
  } catch (e) {
    armedApprove.value = false;
    armedReject.value = false;
    if (e instanceof ApiError) {
      message.value = serverMessage(e) || t("approvals.action_failed");
    } else {
      // fetch rejected → no connection. Approvals never queue.
      message.value = t("approvals.online_only");
    }
  } finally {
    busy.value = false;
  }
}

function onApprove() {
  if (!d.value) return;
  if (!armedApprove.value) {
    armedApprove.value = true;
    armedReject.value = false;
    return;
  }
  runAction(
    () => store.approve(d.value!.name, changed(editedIn.value, d.value!.in_time), changed(editedOut.value, d.value!.out_time)),
    "approved_done",
  );
}

function onReject() {
  if (!d.value) return;
  if (!armedReject.value) {
    armedReject.value = true;
    armedApprove.value = false;
    return;
  }
  runAction(() => store.reject(d.value!.name, reason.value || null), "rejected_done");
}
</script>

<template>
  <main>
    <TopAppBar :title="t('approvals.title')" back @back="router.back()" />
    <section v-if="d" class="ad">
      <Card>
        <h2 class="ad__name">{{ d.employee_name || d.employee }}</h2>
        <p class="ad__date">{{ d.attendance_date || '—' }}</p>
        <div class="ad__chips">
          <Chip :variant="approvalVariant(d.workflow_state)">{{ d.workflow_state }}</Chip>
          <Chip variant="neutral">{{ t('approvals.level', { n: d.current_approval_level || 1 }) }}</Chip>
        </div>
        <p v-if="d.current_approver_name" class="ad__approver">
          {{ t('attendance.current_approver') }}: <strong>{{ d.current_approver_name }}</strong>
        </p>
      </Card>

      <Card>
        <div class="ad__times">
          <label class="ad__field">
            <span class="ad__label">{{ t('approvals.in_time') }}</span>
            <input type="datetime-local" v-model="editedIn" :disabled="!canAct" />
          </label>
          <label class="ad__field">
            <span class="ad__label">{{ t('approvals.out_time') }}</span>
            <input type="datetime-local" v-model="editedOut" :disabled="!canAct" />
          </label>
        </div>
        <p class="ad__hours">
          {{ t('approvals.working_hours') }}: <strong>{{ workedHours.toFixed(2) }}</strong>
        </p>
      </Card>

      <p v-if="expired" class="ad__locked">{{ t('approvals.expired_locked') }}</p>

      <template v-if="canAct">
        <div v-if="armedReject" class="ad__reason">
          <label class="ad__label">{{ t('approvals.reject_reason') }}</label>
          <textarea v-model="reason" rows="3" class="ad__reason-input"></textarea>
        </div>
        <div class="ad__actions">
          <AppButton block :disabled="busy" @click="onApprove">
            {{ armedApprove ? t('approvals.confirm_approve') : t('approvals.approve') }}
          </AppButton>
          <AppButton block variant="destructive" :disabled="busy" @click="onReject">
            {{ armedReject ? t('approvals.confirm_reject') : t('approvals.reject') }}
          </AppButton>
        </div>
      </template>

      <p v-if="message" class="ad__msg">{{ message }}</p>
    </section>
    <BottomNav />
  </main>
</template>

<style scoped>
.ad { padding: 16px var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.ad__name { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: 20px; }
.ad__date { margin: 2px 0 10px; color: var(--ink-secondary); font-size: 13px; }
.ad__chips { display: flex; gap: 8px; flex-wrap: wrap; }
.ad__approver { margin: 12px 0 0; font-size: 13px; color: var(--ink-secondary); }
.ad__approver strong { color: var(--ink-primary); }
.ad__times { display: flex; flex-direction: column; gap: 12px; }
.ad__field { display: flex; flex-direction: column; gap: 6px; }
.ad__label { font-size: 12px; color: var(--ink-secondary); text-transform: uppercase; letter-spacing: .04em; }
.ad__field input {
  font: inherit; padding: 10px 12px; border: 1px solid var(--hairline);
  border-radius: var(--r-md); background: var(--bg-surface); color: var(--ink-primary);
}
.ad__field input:disabled { opacity: .6; }
.ad__hours { margin: 12px 0 0; font-size: 14px; color: var(--ink-secondary); }
.ad__hours strong { color: var(--ink-primary); font-family: var(--font-mono); }
.ad__locked {
  padding: 12px 14px; border-radius: var(--r-md);
  background: var(--warning-soft); color: var(--warning); font-size: 13px; margin: 0;
}
.ad__reason-input {
  width: 100%; box-sizing: border-box; resize: vertical; font: inherit;
  padding: 10px 12px; border: 1px solid var(--hairline);
  border-radius: var(--r-md); background: var(--bg-surface); color: var(--ink-primary);
}
.ad__reason { display: flex; flex-direction: column; gap: 6px; }
.ad__actions { display: flex; flex-direction: column; gap: 10px; }
.ad__msg { text-align: center; color: var(--ink-secondary); font-size: 13px; margin: 4px 0 0; }
</style>
