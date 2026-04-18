<script setup lang="ts">
import { RouterLink } from "vue-router";
defineProps<{
  items: { to: string; label: string; icon: string; badge?: number }[];
}>();
</script>
<template>
  <section class="qa">
    <RouterLink v-for="it in items" :key="it.to" :to="it.to" class="qa__item">
      <span class="qa__icon">{{ it.icon }}</span>
      <span class="qa__label">{{ it.label }}</span>
      <span v-if="it.badge" class="qa__badge">{{ it.badge }}</span>
    </RouterLink>
  </section>
</template>
<style scoped>
.qa { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.qa__item {
  display: flex; flex-direction: column; gap: 4px; padding: 16px;
  background: var(--bg-surface); box-shadow: var(--e-1); border-radius: var(--r-lg);
  color: var(--ink-primary); text-decoration: none; position: relative;
}
.qa__icon { font-size: 22px; }
.qa__label { font-size: 14px; }
.qa__badge {
  position: absolute; top: 12px; right: 12px;
  min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: var(--r-full); background: var(--accent); color: var(--accent-ink);
  font-size: 11px; display: grid; place-items: center;
}
[dir="rtl"] .qa__badge { left: 12px; right: auto; }
</style>
