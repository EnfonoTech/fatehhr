<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import HeroCard from "@/components/HeroCard.vue";
import QuickActionGrid from "@/components/QuickActionGrid.vue";
import NotificationBell from "@/components/NotificationBell.vue";
import AppButton from "@/components/Button.vue";
import VersionBadge from "@/components/VersionBadge.vue";
import Icon from "@/components/Icon.vue";
import { useSessionStore } from "@/stores/session";
import { useProfileStore } from "@/stores/profile";
import { useCheckinStore } from "@/stores/checkin";
import { useAnnouncementStore } from "@/stores/announcement";
import { useNotificationStore } from "@/stores/notification";
import { useSettingsStore } from "@/stores/settings";
import { useSyncStore } from "@/stores/sync";
import { checkinApi, type TodaySummary } from "@/api/checkin";

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const profile = useProfileStore();
const checkin = useCheckinStore();
const ann = useAnnouncementStore();
const notif = useNotificationStore();
const settings = useSettingsStore();
const sync = useSyncStore();

// Daily hours — live-ticks when an IN has no matching OUT yet (open pair).
const todaySummary = ref<TodaySummary>({ worked_seconds: 0, open_since: null });
const tickNow = ref(Date.now());
let tickHandle: number | null = null;

const workedLabel = computed(() => {
  let secs = todaySummary.value.worked_seconds;
  if (todaySummary.value.open_since) {
    // Live part: seconds since the open IN, added to the completed-pair base.
    const since = Date.parse(todaySummary.value.open_since);
    if (!Number.isNaN(since)) {
      secs += Math.max(0, Math.floor((tickNow.value - since) / 1000));
    }
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
});

function computeLocalSummary(): TodaySummary {
  // Mirror the server's greedy IN→OUT pair walk, using today's rows from
  // the Pinia checkin store. `checkin.history` already merges
  // queued-offline rows with server rows, so this gives a sensible value
  // even when the /today_summary endpoint can't be reached.
  const nowStart = new Date();
  const y = nowStart.getFullYear();
  const m = nowStart.getMonth();
  const d = nowStart.getDate();
  const todayLocal = (iso: string) => {
    const dt = new Date(iso.replace(" ", "T"));
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
  };
  // Sort ASC for pairing.
  const rows = [...checkin.history]
    .filter((r) => r.time && todayLocal(r.time))
    .sort((a, b) => (a.time < b.time ? -1 : 1));
  let total = 0;
  let openFrom: string | null = null;
  for (const r of rows) {
    if (r.log_type === "IN") {
      openFrom = r.time;
    } else if (r.log_type === "OUT" && openFrom) {
      const s = Math.max(
        0,
        Math.floor(
          (Date.parse(r.time.replace(" ", "T")) -
            Date.parse(openFrom.replace(" ", "T"))) /
            1000,
        ),
      );
      total += s;
      openFrom = null;
    }
  }
  return { worked_seconds: total, open_since: openFrom };
}

async function refreshWorked() {
  try {
    todaySummary.value = await checkinApi.todaySummary();
  } catch {
    // Offline — fall back to a local computation from the checkin history
    // slice (which already merges queued offline rows).
    todaySummary.value = computeLocalSummary();
  }
}

const greetingKey = computed<
  "dashboard.greeting_morning" | "dashboard.greeting_afternoon" | "dashboard.greeting_evening"
>(() => {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.greeting_morning";
  if (h < 17) return "dashboard.greeting_afternoon";
  return "dashboard.greeting_evening";
});

const quickActions = computed(() => [
  { to: "/leave", label: t("nav.leave"), icon: "leave" as const },
  { to: "/expense", label: t("expense.title"), icon: "receipt" as const },
  { to: "/tasks", label: t("tasks.title"), icon: "tasks" as const },
  { to: "/payslip", label: t("payslip.title"), icon: "payslip" as const },
]);

const recentCheckins = computed(() => checkin.history.slice(0, 3));

function fmtTime(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  return d.toLocaleString(undefined, {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    day: "2-digit", month: "short",
  });
}

async function pullAll() {
  try { await checkin.refreshToday(); } catch { /* offline */ }
  try { await checkin.loadHistory(1); } catch { /* offline */ }
  await refreshWorked();
}

onMounted(async () => {
  await settings.refresh();
  await profile.load();
  await pullAll();
  await ann.load(session.user ?? "");
  await notif.load();
  tickHandle = window.setInterval(() => (tickNow.value = Date.now()), 1000);
});

// When drain finishes (pending drops) or last sync bumps, pull fresh
// state so the Home button and Worked card reflect what's on the server.
// Without this the button used to stay on "Check Out" after an offline
// OUT had synced in the background.
watch(
  () => [sync.pending, sync.lastSyncedAt, sync.status] as const,
  async ([newPending, newLast], [oldPending, oldLast]) => {
    if (newPending !== oldPending || newLast !== oldLast) {
      await pullAll();
    }
  },
);

onUnmounted(() => {
  if (tickHandle) clearInterval(tickHandle);
});
</script>

<template>
  <main class="dash">
    <header class="dash__head">
      <h1>{{ t('app.name') }}</h1>
      <NotificationBell />
    </header>
    <SyncBar />

    <h2 class="dashboard__greeting">
      {{ t(greetingKey, { name: profile.profile?.full_name || session.user || '' }) }}
    </h2>

    <HeroCard class="dash__today">
      <p class="dash__today-status">
        {{ checkin.currentStatus === 'IN' ? t('dashboard.currently_in') : t('dashboard.currently_out') }}
      </p>
      <AppButton block @click="router.push('/checkin')">
        {{ checkin.currentStatus === 'IN' ? t('checkin.check_out') : t('checkin.check_in') }}
      </AppButton>
    </HeroCard>

    <div class="dash__hours" :class="{ 'is-live': todaySummary.open_since }">
      <span class="dash__hours-label">{{ t('dashboard.worked_today') }}</span>
      <span class="dash__hours-value">{{ workedLabel }}</span>
      <span v-if="todaySummary.open_since" class="dash__hours-pulse" aria-hidden="true"></span>
    </div>

    <QuickActionGrid :items="quickActions" />

    <section v-if="recentCheckins.length" class="dash__recent">
      <header class="dash__recent-head">
        <h3>{{ t('checkin.history') }}</h3>
        <RouterLink to="/checkin/history" class="dash__recent-link">
          {{ t('leave.view_list') }}
        </RouterLink>
      </header>
      <ul class="dash__recent-list">
        <li v-for="r in recentCheckins" :key="r.name" class="dash__recent-row">
          <span
            class="dash__recent-icon"
            :class="r.log_type === 'IN' ? 'is-in' : 'is-out'"
          >
            <Icon :name="r.log_type === 'IN' ? 'arrow-down' : 'arrow-up'" :size="16" />
          </span>
          <span class="dash__recent-body">
            <span class="dash__recent-title">
              {{ r.log_type === 'IN' ? t('checkin.check_in') : t('checkin.check_out') }}
            </span>
            <span class="dash__recent-sub">
              {{ r.custom_location_address || r.custom_task || '—' }}
            </span>
          </span>
          <time class="dash__recent-time">{{ fmtTime(r.time) }}</time>
        </li>
      </ul>
    </section>

    <article
      v-if="ann.feed[0]"
      class="dash__ann"
      @click="router.push(`/announcements/${encodeURIComponent(ann.feed[0].name)}`)"
    >
      <span class="dash__ann-label">{{ t('dashboard.latest_announcement') }}</span>
      <h3>{{ ann.feed[0].title }}</h3>
    </article>

    <VersionBadge />

    <BottomNav />
  </main>
</template>

<style scoped>
.dash { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.dash__head {
  display: flex; align-items: center; justify-content: space-between; padding: 10px 0 0;
}
.dash__head h1 {
  font-family: var(--font-display); font-weight: 400; font-size: 18px; margin: 0;
  color: var(--ink-secondary); letter-spacing: 0.01em;
}
.dashboard__greeting {
  font-family: var(--font-display); font-weight: 400; font-size: 20px;
  margin: 0; letter-spacing: -0.01em; line-height: 1.3;
  color: var(--ink-primary);
}
[dir="rtl"] .dashboard__greeting { font-family: var(--font-display-ar); font-weight: 500; }
.dash__today-status { margin: 0 0 10px; color: var(--ink-secondary); font-size: 13px; }

.dash__hours {
  background: var(--bg-surface);
  border-radius: var(--r-lg);
  box-shadow: var(--e-1);
  padding: 12px 14px;
  display: flex; align-items: baseline; gap: 10px;
  position: relative;
}
.dash__hours-label {
  font-size: 12px; color: var(--ink-secondary); letter-spacing: 0.04em;
  text-transform: uppercase;
}
.dash__hours-value {
  font-family: var(--font-mono); font-size: 22px; font-weight: 500;
  color: var(--ink-primary); margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.dash__hours-pulse {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--success, #2a6b3a);
  box-shadow: 0 0 0 0 rgba(42, 107, 58, 0.5);
  animation: dash-pulse 1.8s ease-in-out infinite;
  align-self: center;
}
@keyframes dash-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(42, 107, 58, 0.5); }
  50%      { box-shadow: 0 0 0 6px rgba(42, 107, 58, 0); }
}

.dash__recent {
  background: var(--bg-surface); border-radius: var(--r-lg); box-shadow: var(--e-1);
  padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;
}
.dash__recent-head { display: flex; justify-content: space-between; align-items: baseline; }
.dash__recent-head h3 {
  font-family: var(--font-display); font-weight: 500; font-size: 15px; margin: 0;
}
.dash__recent-link {
  font-size: 12px; color: var(--ink-secondary);
  text-decoration: underline; text-underline-offset: 3px;
}
.dash__recent-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.dash__recent-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--hairline);
}
.dash__recent-row:first-child { border-top: 0; }
.dash__recent-icon {
  width: 30px; height: 30px;
  display: grid; place-items: center;
  border-radius: var(--r-full);
  flex-shrink: 0;
}
.dash__recent-icon.is-in {
  background: var(--success-soft, #d8e8de);
  color: var(--success, #2a6b3a);
}
.dash__recent-icon.is-out {
  background: var(--bg-sunk);
  color: var(--ink-secondary);
}
.dash__recent-body { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dash__recent-title { font-size: 13px; font-weight: 500; color: var(--ink-primary); }
.dash__recent-sub {
  font-size: 11px; color: var(--ink-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dash__recent-time { font-family: var(--font-mono); font-size: 11px; color: var(--ink-secondary); }
.dash__ann {
  background: var(--bg-surface); border-radius: var(--r-lg);
  box-shadow: var(--e-1); padding: 14px; cursor: pointer;
}
.dash__ann-label {
  font-size: 11px; color: var(--ink-secondary);
  letter-spacing: .08em; text-transform: uppercase;
}
.dash__ann h3 {
  font-family: var(--font-display); font-weight: 400; font-size: 16px; margin: 4px 0 0;
}
</style>
