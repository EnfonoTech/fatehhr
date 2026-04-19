<script setup lang="ts">
import { RouterLink } from "vue-router";
import Icon from "./Icon.vue";
import type { Component } from "vue";

type IconName = InstanceType<typeof Icon>["$props"]["name"];

defineProps<{
  items: { to: string; label: string; icon: IconName; badge?: number }[];
}>();

void (null as unknown as Component); // tree-shake guard
</script>
<template>
  <section class="qa">
    <RouterLink v-for="it in items" :key="it.to" :to="it.to" class="qa__item">
      <span class="qa__icon-wrap">
        <Icon :name="it.icon" :size="22" />
      </span>
      <span class="qa__label">{{ it.label }}</span>
      <span v-if="it.badge" class="qa__badge">{{ it.badge }}</span>
    </RouterLink>
  </section>
</template>
<style scoped>
.qa { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.qa__item {
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  background: var(--bg-surface); box-shadow: var(--e-1); border-radius: var(--r-lg);
  color: var(--ink-primary); text-decoration: none; position: relative;
  transition: transform 120ms ease;
}
.qa__item:active { transform: scale(0.98); background: var(--bg-sunk); }
.qa__icon-wrap {
  width: 38px; height: 38px;
  display: grid; place-items: center;
  background: var(--accent-soft, #e8f0ee);
  color: var(--accent, #2E5D5A);
  border-radius: var(--r-md);
  flex-shrink: 0;
}
.qa__label { font-size: 14px; font-weight: 500; letter-spacing: -0.005em; }
.qa__badge {
  position: absolute; top: 12px; right: 12px;
  min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: var(--r-full); background: var(--accent); color: var(--accent-ink);
  font-size: 11px; display: grid; place-items: center;
}
[dir="rtl"] .qa__badge { left: 12px; right: auto; }
</style>
