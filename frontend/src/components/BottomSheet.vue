<script setup lang="ts">
defineProps<{ open: boolean; title?: string }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="sheet-scrim" @click.self="$emit('close')">
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet__handle" />
        <h2 v-if="title" class="sheet__title">{{ title }}</h2>
        <div class="sheet__body"><slot /></div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.sheet-scrim {
  position: fixed; inset: 0; background: rgba(26,23,20,.45);
  display: flex; align-items: flex-end; z-index: 50;
}
.sheet {
  background: var(--bg-surface); width: 100%;
  border-top-left-radius: var(--r-xl); border-top-right-radius: var(--r-xl);
  padding: 12px var(--page-gutter) calc(24px + env(safe-area-inset-bottom));
  max-height: 86vh; overflow: auto;
  animation: slideUp var(--m-base) forwards;
}
.sheet__handle {
  width: 36px; height: 4px; border-radius: var(--r-full);
  background: var(--hairline-strong); margin: 0 auto 12px;
}
.sheet__title {
  font-family: var(--font-display); font-weight: 400;
  font-size: 20px; margin: 0 0 12px;
}
[dir="rtl"] .sheet__title { font-family: var(--font-display-ar); font-weight: 500; }
@keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }
</style>
