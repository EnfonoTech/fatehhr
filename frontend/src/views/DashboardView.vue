<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import HeroCard from "@/components/HeroCard.vue";
import QuickActionGrid from "@/components/QuickActionGrid.vue";
import NotificationBell from "@/components/NotificationBell.vue";
import AppButton from "@/components/Button.vue";
import VersionBadge from "@/components/VersionBadge.vue";
import { useSessionStore } from "@/stores/session";
import { useProfileStore } from "@/stores/profile";
import { useCheckinStore } from "@/stores/checkin";
import { useLeaveStore } from "@/stores/leave";
import { useAnnouncementStore } from "@/stores/announcement";
import { useNotificationStore } from "@/stores/notification";

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const profile = useProfileStore();
const checkin = useCheckinStore();
const leave = useLeaveStore();
const ann = useAnnouncementStore();
const notif = useNotificationStore();

const greetingKey = computed<
  "dashboard.greeting_morning" | "dashboard.greeting_afternoon" | "dashboard.greeting_evening"
>(() => {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.greeting_morning";
  if (h < 17) return "dashboard.greeting_afternoon";
  return "dashboard.greeting_evening";
});

const quickActions = computed(() => [
  { to: "/leave", label: t("nav.leave"), icon: "◈" },
  { to: "/expense", label: t("expense.title"), icon: "₪" },
  { to: "/tasks", label: t("tasks.title"), icon: "◆" },
  { to: "/announcements", label: t("announce.title"), icon: "✎" },
]);

const primaryBalance = computed(() => leave.types[0]?.balance ?? 0);

onMounted(async () => {
  await profile.load();
  await checkin.refreshToday();
  await leave.loadTypes();
  await ann.load(session.user ?? "");
  await notif.load();
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

    <section class="dash__chips">
      <span class="dash__chip">
        {{ t('dashboard.leave_balance') }}: <strong>{{ primaryBalance.toFixed(1) }}</strong>
      </span>
      <span v-if="notif.unread > 0" class="dash__chip is-accent">
        {{ notif.unread }} {{ t('dashboard.unread') }}
      </span>
    </section>

    <QuickActionGrid :items="quickActions" />

    <article
      v-if="ann.feed[0]"
      class="dash__ann"
      @click="router.push(`/announcements/${encodeURIComponent(ann.feed[0].name)}`)"
    >
      <span class="dash__ann-label">{{ t('dashboard.latest_announcement') }}</span>
      <h3>{{ ann.feed[0].title }}</h3>
    </article>

    <RouterLink to="/profile" class="dash__profile-link">{{ t('profile.title') }} →</RouterLink>
    <VersionBadge />

    <BottomNav />
  </main>
</template>

<style scoped>
.dash { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 16px; }
.dash__head {
  display: flex; align-items: center; justify-content: space-between; padding: 12px 0 0;
}
.dash__head h1 {
  font-family: var(--font-display); font-weight: 400; font-size: 22px; margin: 0;
}
.dashboard__greeting {
  font-family: var(--font-display); font-weight: 400; font-size: 28px;
  margin: 0; letter-spacing: -0.01em;
}
[dir="rtl"] .dashboard__greeting { font-family: var(--font-display-ar); font-weight: 500; }
.dash__today-status { margin: 0 0 12px; color: var(--ink-secondary); }
.dash__chips { display: flex; gap: 8px; flex-wrap: wrap; }
.dash__chip { background: var(--bg-sunk); padding: 6px 12px; border-radius: var(--r-full); font-size: 13px; }
.dash__chip.is-accent { background: var(--accent-soft); color: var(--accent); }
.dash__ann {
  background: var(--bg-surface); border-radius: var(--r-lg);
  box-shadow: var(--e-1); padding: 14px; cursor: pointer;
}
.dash__ann-label {
  font-size: 11px; color: var(--ink-secondary);
  letter-spacing: .08em; text-transform: uppercase;
}
.dash__ann h3 {
  font-family: var(--font-display); font-weight: 400; font-size: 18px; margin: 4px 0 0;
}
.dash__profile-link {
  display: block; text-align: center; color: var(--ink-secondary);
  text-decoration: none; font-size: 14px; padding: 8px 0;
}
</style>
