<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
const { t } = useI18n();
const tabs = [
  { to: "/", key: "nav.home", icon: "◉" },
  { to: "/attendance", key: "nav.attendance", icon: "◎" },
  { to: "/leave", key: "nav.leave", icon: "◈" },
  { to: "/expense", key: "nav.expense", icon: "₪" },
  { to: "/more", key: "nav.more", icon: "⋯" },
];
</script>

<template>
  <nav class="bnav">
    <RouterLink v-for="t2 in tabs" :key="t2.to" :to="t2.to" class="bnav__tab">
      <span class="bnav__icon">{{ t2.icon }}</span>
      <span class="bnav__label">{{ t(t2.key) }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bnav {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: grid; grid-template-columns: repeat(5, 1fr);
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom)) 0;
  background: var(--bg-surface); box-shadow: var(--e-1); z-index: 10;
}
.bnav__tab {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  color: var(--ink-secondary); font-size: 11px; text-decoration: none;
  padding: 8px 4px; border-radius: var(--r-md); margin: 0 4px;
}
.bnav__tab.router-link-active { color: var(--accent); background: var(--accent-soft); }
.bnav__icon { font-size: 18px; line-height: 1; }
</style>
