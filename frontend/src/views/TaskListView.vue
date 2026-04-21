<script setup lang="ts">
import { onMounted, ref, onUnmounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import { useTasksStore } from "@/stores/tasks";

const { t } = useI18n();
const router = useRouter();
const store = useTasksStore();
const tick = ref(0);
let interval: number | null = null;

// Reactive label — tick dep forces 1 Hz recompute, startedAt dep ensures
// it also updates when the timer is started/stopped elsewhere.
const elapsedLabel = computed(() => {
  tick.value;
  store.running?.startedAt;
  return store.elapsed();
});

onMounted(() => {
  store.load();
  interval = window.setInterval(() => (tick.value++), 1000);
});
onUnmounted(() => {
  if (interval) clearInterval(interval);
});

function isRunning(name: string) {
  return store.running?.task === name;
}
async function toggle(name: string) {
  if (isRunning(name)) {
    await store.stop();
  } else {
    if (store.running) await store.stop();
    await store.start(name);
  }
}
</script>

<template>
  <main class="tasks">
    <TopAppBar :title="t('tasks.title')" back @back="router.back()" />
    <SyncBar />

    <Card
      v-for="tk in store.tasks"
      :key="tk.name"
      class="tasks__card"
      :class="{ 'is-running': isRunning(tk.name) }"
    >
      <div class="tasks__head">
        <h3>{{ tk.subject }}</h3>
        <Chip :variant="(tk.priority as string)?.toLowerCase() === 'high' ? 'rejected' : 'neutral'">
          {{ tk.priority || '—' }}
        </Chip>
      </div>
      <p class="tasks__meta">
        {{ tk.project ?? '' }}{{ tk.exp_end_date ? ' · ' + tk.exp_end_date : '' }}
      </p>
      <p v-if="isRunning(tk.name)" class="tasks__elapsed">
        {{ elapsedLabel }}
      </p>
      <AppButton
        :variant="isRunning(tk.name) ? 'destructive' : 'primary'"
        block
        @click="toggle(tk.name)"
      >{{ isRunning(tk.name) ? t('tasks.stop') : t('tasks.start') }}</AppButton>
    </Card>

    <p v-if="!store.tasks.length" class="tasks__empty">{{ t('tasks.empty') }}</p>

    <BottomNav />
  </main>
</template>

<style scoped>
.tasks { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.tasks__card.is-running { background: var(--accent-soft); }
.tasks__head { display: flex; justify-content: space-between; align-items: baseline; }
.tasks__head h3 {
  margin: 0; font-family: var(--font-display); font-weight: 400; font-size: 18px;
}
.tasks__meta { color: var(--ink-secondary); font-size: 13px; margin: 4px 0; }
.tasks__elapsed { font-family: var(--font-mono); font-size: 24px; margin: 8px 0; }
.tasks__empty { padding: 40px var(--page-gutter); color: var(--ink-secondary); text-align: center; }
</style>
