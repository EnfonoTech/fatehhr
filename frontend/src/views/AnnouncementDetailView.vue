<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Markdown from "@/components/Markdown.vue";
import { useAnnouncementStore } from "@/stores/announcement";
import { useSessionStore } from "@/stores/session";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useAnnouncementStore();
const session = useSessionStore();

const item = computed(() =>
  store.feed.find((a) => a.name === String(route.params.name)) ?? null,
);

onMounted(async () => {
  if (!store.feed.length) await store.load(session.user ?? "");
  if (item.value) await store.markRead(item.value.name);
});
</script>

<template>
  <main class="anndet" v-if="item">
    <TopAppBar :title="t('announce.detail')" back @back="router.back()" />
    <article class="anndet__article">
      <h1>{{ item.title }}</h1>
      <p class="anndet__meta">
        {{ new Date(item.published_on).toLocaleString() }} · {{ item.published_by }}
      </p>
      <Markdown :source="item.body" />
    </article>
    <BottomNav />
  </main>
</template>

<style scoped>
.anndet__article { padding: 16px var(--page-gutter) 120px; }
.anndet__article h1 {
  font-family: var(--font-display); font-weight: 400; font-size: 28px;
  letter-spacing: -0.01em; margin: 4px 0 8px;
}
[dir="rtl"] .anndet__article h1 { font-family: var(--font-display-ar); font-weight: 500; }
.anndet__meta { color: var(--ink-secondary); font-size: 13px; margin: 0 0 16px; }
</style>
