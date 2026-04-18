<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import { useAnnouncementStore } from "@/stores/announcement";
import { useSessionStore } from "@/stores/session";

const { t } = useI18n();
const router = useRouter();
const store = useAnnouncementStore();
const session = useSessionStore();
const readMap = ref<Record<string, boolean>>({});

async function rehydrate() {
  const m: Record<string, boolean> = {};
  for (const r of store.feed) m[r.name] = await store.isRead(r.name);
  readMap.value = m;
}

onMounted(async () => {
  await store.load(session.user ?? "");
  await rehydrate();
});
</script>

<template>
  <main class="annlist">
    <TopAppBar :title="t('announce.title')" back @back="router.back()" />
    <SyncBar />
    <article
      v-for="a in store.feed"
      :key="a.name"
      :class="['annlist__row', { 'is-unread': !readMap[a.name] }]"
      @click="router.push(`/announcements/${encodeURIComponent(a.name)}`)"
    >
      <span v-if="a.pinned" class="annlist__pin">📌</span>
      <h3>{{ a.title }}</h3>
      <p class="annlist__when">{{ new Date(a.published_on).toLocaleDateString() }}</p>
    </article>
    <p v-if="!store.feed.length" class="empty">{{ t('announce.empty') }}</p>
    <BottomNav />
  </main>
</template>

<style scoped>
.annlist { padding: 0 var(--page-gutter) 120px; }
.annlist__row { padding: 14px 0; border-bottom: 1px solid var(--hairline); cursor: pointer; }
.annlist__row.is-unread h3 { font-weight: 600; }
.annlist__row h3 {
  margin: 2px 0; font-family: var(--font-display);
  font-weight: 400; font-size: 17px;
}
.annlist__when { color: var(--ink-secondary); font-size: 12px; margin: 0; }
.annlist__pin { font-size: 12px; color: var(--accent); }
.empty { padding: 40px 0; color: var(--ink-secondary); text-align: center; }
</style>
