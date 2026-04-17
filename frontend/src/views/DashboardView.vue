<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useSessionStore } from "@/stores/session";
import { meApi, type Profile } from "@/api/me";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";

const { t } = useI18n();
const session = useSessionStore();
const profile = ref<Profile | null>(null);

const greetingKey = computed<
  "dashboard.greeting_morning" | "dashboard.greeting_afternoon" | "dashboard.greeting_evening"
>(() => {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.greeting_morning";
  if (h < 17) return "dashboard.greeting_afternoon";
  return "dashboard.greeting_evening";
});

onMounted(async () => {
  try {
    profile.value = await meApi.profile();
  } catch {
    /* Phase 1 swallow */
  }
});
</script>

<template>
  <main class="dashboard">
    <TopAppBar :title="t('app.name')" />
    <h2 class="dashboard__greeting">
      {{ t(greetingKey, { name: profile?.full_name || session.user || '' }) }}
    </h2>
    <p class="dashboard__meta" v-if="profile?.designation || profile?.department">
      {{ [profile?.designation, profile?.department].filter(Boolean).join(" · ") }}
    </p>
    <p class="dashboard__stub">{{ t('dashboard.stub') }}</p>
  </main>
</template>

<style scoped>
.dashboard { padding-bottom: 80px; }
.dashboard__greeting {
  font-family: var(--font-display); font-weight: 400; font-size: 32px;
  margin: 8px var(--page-gutter) 4px; letter-spacing: -0.01em;
}
[dir="rtl"] .dashboard__greeting { font-family: var(--font-display-ar); font-weight: 500; }
.dashboard__meta { color: var(--ink-secondary); margin: 0 var(--page-gutter); }
.dashboard__stub { color: var(--ink-tertiary); margin: 24px var(--page-gutter); font-size: 13px; }
</style>
