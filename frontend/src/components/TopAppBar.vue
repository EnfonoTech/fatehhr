<script setup lang="ts">
defineProps<{ title: string; back?: boolean }>();
defineEmits<{ back: [] }>();
</script>

<template>
  <header class="bar">
    <button v-if="back" class="bar__back" aria-label="Back" @click="$emit('back')">‹</button>
    <h1 class="bar__title">{{ title }}</h1>
  </header>
</template>

<style scoped>
.bar {
  display: flex; align-items: center; gap: 8px;
  padding: 16px var(--page-gutter);
  min-height: 56px;
  background: transparent;
}
.bar__back {
  width: 36px; height: 36px; border-radius: var(--r-full);
  color: var(--ink-primary); font-size: 24px;
  display: inline-flex; align-items: center; justify-content: center;
}
.bar__back:active { background: var(--bg-sunk); }
.bar__title {
  font-family: var(--font-display); font-weight: 400;
  font-size: 24px; margin: 0; letter-spacing: -0.01em;
}
[dir="rtl"] .bar__back { transform: scaleX(-1); }
[dir="rtl"] .bar__title { font-family: var(--font-display-ar); }
</style>
