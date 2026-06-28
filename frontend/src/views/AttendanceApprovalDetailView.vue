<script setup lang="ts">
import { onMounted, onUnmounted, ref, reactive, computed } from "vue";
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
// checkin.name -> datetime-local string (editable). Multi-site: a day has many.
const editedTimes = reactive<Record<string, string>>({});
const reason = ref<string>("");
const armedApprove = ref(false);
const armedReject = ref(false);
const busy = ref(false);
const message = ref<string | null>(null);
const now = ref(Date.now());
let tick: number | null = null;

function seedEdits() {
  Object.keys(editedTimes).forEach((k) => delete editedTimes[k]);
  for (const c of store.detail?.checkins ?? []) {
    editedTimes[c.name] = toLocalInput(c.time);
  }
}

onMounted(async () => {
  try {
    await store.loadDetail(name);
    seedEdits();
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

interface Pair { id: string; project: string | null; inName: string | null; outName: string | null; }
// Pair the raw checkins IN→OUT for display; each row's times stay individually editable.
const pairs = computed<Pair[]>(() => {
  const cks = d.value?.checkins ?? [];
  const out: Pair[] = [];
  let openIn: typeof cks[number] | null = null;
  for (const c of cks) {
    if (c.log_type === "IN") {
      if (openIn) out.push({ id: openIn.name, project: openIn.project_name, inName: openIn.name, outName: null });
      openIn = c;
    } else {
      out.push({ id: c.name, project: (openIn?.project_name ?? c.project_name), inName: openIn?.name ?? null, outName: c.name });
      openIn = null;
    }
  }
  if (openIn) out.push({ id: openIn.name, project: openIn.project_name, inName: openIn.name, outName: null });
  return out;
});
const hasCheckins = computed(() => (d.value?.checkins?.length ?? 0) > 0);

function pairHours(p: Pair): number {
  const a = p.inName && editedTimes[p.inName] ? new Date(editedTimes[p.inName]).getTime() : NaN;
  const b = p.outName && editedTimes[p.outName] ? new Date(editedTimes[p.outName]).getTime() : NaN;
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round(((b - a) / 3_600_000) * 100) / 100;
}
const totalHours = computed(() => pairs.value.reduce((s, p) => s + pairHours(p), 0));

/** Original checkin time (UTC-ISO) for a checkin name, to detect edits. */
function originalIso(checkinName: string): string | null {
  return d.value?.checkins?.find((c) => c.name === checkinName)?.time ?? null;
}
function dirtyEdits(): { checkin: string; time: string }[] {
  const out: { checkin: string; time: string }[] = [];
  for (const [cname, local] of Object.entries(editedTimes)) {
    if (local && local !== toLocalInput(originalIso(cname))) {
      const iso = toUtcIso(local);
      if (iso) out.push({ checkin: cname, time: iso });
    }
  }
  return out;
}

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
  const dt = new Date(local);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
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
  } catch { /* fall through */ }
  return null;
}
function handleErr(e: unknown) {
  armedApprove.value = false;
  armedReject.value = false;
  message.value = e instanceof ApiError ? serverMessage(e) || t("approvals.action_failed") : t("approvals.online_only");
}

/** Persist any edited times to the raw checkins (cooperheat re-derives the pairs). */
async function saveTimes() {
  const edits = dirtyEdits();
  if (!edits.length) return;
  await store.updateCheckins(name, edits);
  seedEdits();
}

async function onSaveTimes() {
  busy.value = true;
  message.value = null;
  try {
    await saveTimes();
    message.value = t("approvals.times_saved");
  } catch (e) {
    handleErr(e);
  } finally {
    busy.value = false;
  }
}

async function onApprove() {
  if (!d.value) return;
  if (!armedApprove.value) {
    armedApprove.value = true;
    armedReject.value = false;
    return;
  }
  busy.value = true;
  message.value = null;
  try {
    // Persist any time corrections first (multi-pair), then advance the workflow.
    await saveTimes();
    const res = await store.approve(d.value.name);
    armedApprove.value = false;
    if (res.workflow_state === "Approved") {
      message.value = t("approvals.fully_approved");
      window.setTimeout(() => router.replace("/approvals"), 1000);
    } else {
      await store.loadDetail(name);
      seedEdits();
      message.value = t("approvals.advanced");
    }
  } catch (e) {
    handleErr(e);
  } finally {
    busy.value = false;
  }
}

async function onReject() {
  if (!d.value) return;
  if (!armedReject.value) {
    armedReject.value = true;
    armedApprove.value = false;
    return;
  }
  busy.value = true;
  message.value = null;
  try {
    await store.reject(d.value.name, reason.value || null);
    armedReject.value = false;
    message.value = t("approvals.rejected_done");
    window.setTimeout(() => router.replace("/approvals"), 1000);
  } catch (e) {
    handleErr(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main>
    <TopAppBar :title="t('approvals.title')" back @back="router.back()" />
    <section v-if="d" class="ad">
      <Card>
        <h2 class="ad__name">{{ d.employee_name || d.employee }}</h2>
        <p class="ad__date">{{ d.attendance_date || '—' }}<span v-if="d.department"> · {{ d.department }}</span></p>
        <div class="ad__chips">
          <Chip :variant="approvalVariant(d.workflow_state)">{{ d.workflow_state }}</Chip>
          <Chip v-if="isPending" variant="neutral">{{ t('approvals.level_of', { n: d.current_approval_level || 1 }) }}</Chip>
        </div>
        <p v-if="d.current_approver_name" class="ad__approver">
          {{ t('attendance.current_approver') }}: <strong>{{ d.current_approver_name }}</strong>
        </p>
      </Card>

      <!-- Multi-site: one editable IN/OUT pair per site -->
      <Card v-if="hasCheckins">
        <h3 class="ad__h3">{{ t('approvals.checkin_pairs') }}</h3>
        <div v-for="(p, i) in pairs" :key="p.id" class="ad__pair">
          <div class="ad__pair-head">
            <span class="ad__pair-site">{{ p.project || t('approvals.pair', { n: i + 1 }) }}</span>
            <span class="ad__pair-hours">{{ pairHours(p).toFixed(2) }}h</span>
          </div>
          <div class="ad__times">
            <label class="ad__field">
              <span class="ad__label">{{ t('approvals.in_time') }}</span>
              <input v-if="p.inName" type="datetime-local" v-model="editedTimes[p.inName]" :disabled="!canAct" />
              <span v-else class="ad__missing">—</span>
            </label>
            <label class="ad__field">
              <span class="ad__label">{{ t('approvals.out_time') }}</span>
              <input v-if="p.outName" type="datetime-local" v-model="editedTimes[p.outName]" :disabled="!canAct" />
              <span v-else class="ad__missing">{{ t('approvals.open_pair') }}</span>
            </label>
          </div>
        </div>
        <p class="ad__hours">{{ t('approvals.working_hours') }}: <strong>{{ totalHours.toFixed(2) }}</strong></p>
        <AppButton v-if="canAct" variant="secondary" block :disabled="busy" @click="onSaveTimes">
          {{ t('approvals.save_times') }}
        </AppButton>
      </Card>

      <!-- Legacy / no checkins: show the single in/out read-only -->
      <Card v-else>
        <p class="ad__hours">{{ t('approvals.working_hours') }}: <strong>{{ (d.working_hours || 0).toFixed(2) }}</strong></p>
        <p class="ad__missing">{{ t('approvals.no_checkins') }}</p>
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
        <p v-if="armedApprove || armedReject" class="ad__confirm-hint">{{ t('approvals.confirm_hint') }}</p>
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
.ad__h3 { font-family: var(--font-display); font-weight: 400; font-size: 16px; margin: 0 0 10px; }
.ad__pair { padding: 10px 0; border-top: 1px solid var(--hairline); }
.ad__pair:first-of-type { border-top: 0; padding-top: 0; }
.ad__pair-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.ad__pair-site { font-size: 14px; font-weight: 600; color: var(--ink-primary); }
.ad__pair-hours { font-family: var(--font-mono); font-size: 13px; color: var(--ink-secondary); }
.ad__times { display: flex; flex-direction: column; gap: 10px; }
.ad__field { display: flex; flex-direction: column; gap: 6px; }
.ad__label { font-size: 12px; color: var(--ink-secondary); text-transform: uppercase; letter-spacing: .04em; }
.ad__field input {
  font: inherit; padding: 10px 12px; border: 1px solid var(--hairline);
  border-radius: var(--r-md); background: var(--bg-surface); color: var(--ink-primary);
}
.ad__field input:disabled { opacity: .6; }
.ad__missing { color: var(--ink-tertiary); font-size: 13px; padding: 10px 0; }
.ad__hours { margin: 12px 0 10px; font-size: 14px; color: var(--ink-secondary); }
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
.ad__confirm-hint { text-align: center; color: var(--warning); font-size: 12.5px; margin: 8px 0 0; }
.ad__msg { text-align: center; color: var(--ink-secondary); font-size: 13px; margin: 8px 0 0; padding: 10px 12px; background: var(--bg-sunk); border-radius: var(--r-md); }
</style>
