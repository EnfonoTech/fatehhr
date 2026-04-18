<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import ListRow from "@/components/ListRow.vue";
import { useNotificationStore } from "@/stores/notification";

const { t } = useI18n();
const router = useRouter();
const store = useNotificationStore();
onMounted(() => store.load());

async function open(name: string) {
  await store.markRead(name);
}
</script>

<template>
  <main>
    <TopAppBar :title="t('notifications.title')" back @back="router.back()" />
    <ListRow
      v-for="r in store.rows"
      :key="r.name"
      :title="r.subject"
      :subtitle="new Date(r.creation).toLocaleString()"
      :trailing="r.read ? '' : '●'"
      @click="open(r.name)"
    />
    <p v-if="!store.rows.length" class="empty">{{ t('notifications.empty') }}</p>
    <BottomNav />
  </main>
</template>

<style scoped>
.empty { padding: 40px var(--page-gutter); color: var(--ink-secondary); text-align: center; }
</style>
