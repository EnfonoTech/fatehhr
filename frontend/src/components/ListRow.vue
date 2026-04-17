<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
  trailing?: string;
  icon?: string;
}>();
</script>

<template>
  <div class="row">
    <div v-if="icon" class="row__icon">{{ icon }}</div>
    <div class="row__body">
      <div class="row__title">{{ title }}</div>
      <div v-if="subtitle" class="row__sub">{{ subtitle }}</div>
    </div>
    <div v-if="trailing" class="row__trailing">{{ trailing }}</div>
  </div>
</template>

<style scoped>
.row {
  display: flex; align-items: center; gap: 12px;
  min-height: 56px; padding: 10px var(--page-gutter);
  border-bottom: 1px solid var(--hairline);
}
.row__icon {
  width: 36px; height: 36px; border-radius: var(--r-full);
  background: var(--bg-sunk); display: grid; place-items: center;
}
.row__body { flex: 1; min-width: 0; }
.row__title { font-size: 15px; font-weight: 500; color: var(--ink-primary); }
.row__sub { font-size: 13px; color: var(--ink-secondary); }
.row__trailing { font-family: var(--font-mono); color: var(--ink-secondary); }
</style>
