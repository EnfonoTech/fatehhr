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
    <!-- Material-style bell, thin 1.75 stroke matching Frappe HR's icon weight -->
    <svg
      class="bell__icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z" />
      <path d="M10.5 20a1.5 1.5 0 0 0 3 0" />
    </svg>
    <span v-if="store.unread > 0" class="bell__badge">{{ store.unread > 9 ? "9+" : store.unread }}</span>
  </button>
</template>

<style scoped>
.bell {
  position: relative;
  width: 40px; height: 40px;
  border-radius: var(--r-full);
  background: var(--bg-surface);
  box-shadow: var(--e-1);
  color: var(--ink-primary);
  display: grid; place-items: center;
  transition: transform 120ms ease;
}
.bell:active {
  background: var(--bg-sunk);
  transform: scale(0.96);
}
.bell__icon { display: block; }

.bell__badge {
  position: absolute;
  top: -3px; right: -3px;
  min-width: 18px; height: 18px;
  padding: 0 5px;
  border-radius: var(--r-full);
  background: var(--danger, #c1121f);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono);
  letter-spacing: 0;
  display: grid; place-items: center;
  border: 2px solid var(--bg-canvas);
  line-height: 1;
}
[dir="rtl"] .bell__badge { left: -3px; right: auto; }
</style>
