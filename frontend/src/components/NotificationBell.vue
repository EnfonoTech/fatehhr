<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useNotificationStore } from "@/stores/notification";
const router = useRouter();
const store = useNotificationStore();
onMounted(() => store.load());
</script>

<template>
  <button class="bell" @click="router.push('/notifications')" aria-label="Notifications">
    <span>🔔</span>
    <span v-if="store.unread > 0" class="bell__dot">{{ store.unread }}</span>
  </button>
</template>

<style scoped>
.bell {
  position: relative; width: 40px; height: 40px; border-radius: var(--r-full);
  color: var(--ink-primary); font-size: 18px;
  display: grid; place-items: center;
}
.bell:active { background: var(--bg-sunk); }
.bell__dot {
  position: absolute; top: 4px; right: 4px; min-width: 18px; height: 18px;
  padding: 0 5px; border-radius: var(--r-full);
  background: var(--accent); color: var(--accent-ink);
  font-size: 11px; display: grid; place-items: center;
}
[dir="rtl"] .bell__dot { left: 4px; right: auto; }
</style>
