<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import Icon from "./Icon.vue";
const { t } = useI18n();
const tabs = [
  { to: "/", key: "nav.home", icon: "home" as const },
  { to: "/attendance", key: "nav.attendance", icon: "calendar" as const },
  { to: "/leave", key: "nav.leave", icon: "leave" as const },
  { to: "/expense", key: "nav.expense", icon: "receipt" as const },
  { to: "/more", key: "nav.more", icon: "more" as const },
];
</script>

<template>
  <nav class="bnav">
    <RouterLink v-for="t2 in tabs" :key="t2.to" :to="t2.to" class="bnav__tab">
      <Icon :name="t2.icon" :size="22" class="bnav__icon" />
      <span class="bnav__label">{{ t(t2.key) }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bnav {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: grid; grid-template-columns: repeat(5, 1fr);
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom)) 0;
  background: var(--bg-surface);
  border-top: 1px solid var(--hairline);
  box-shadow: 0 -2px 8px rgba(0,0,0,0.04);
  z-index: 10;
}
.bnav__tab {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  color: var(--ink-secondary); font-size: 11px; text-decoration: none;
  padding: 8px 4px; border-radius: var(--r-md); margin: 0 4px;
  transition: color 120ms ease, background 120ms ease;
}
.bnav__tab.router-link-active { color: var(--accent); background: var(--accent-soft); }
.bnav__icon { display: block; }
.bnav__label { font-weight: 500; letter-spacing: 0.01em; }
</style>
