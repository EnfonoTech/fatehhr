<script setup lang="ts">
defineProps<{
  variant?: "neutral" | "pending" | "approved" | "rejected" | "paid" | "draft" | "info";
  dot?: boolean;
}>();
</script>

<template>
  <span class="chip" :class="`chip--${variant ?? 'neutral'}`">
    <span v-if="dot" class="chip__dot" />
    <slot />
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; font-size: 12px; border-radius: var(--r-full);
  background: var(--bg-sunk); color: var(--ink-secondary);
}
.chip__dot { width: 6px; height: 6px; border-radius: var(--r-full); background: currentColor; }
.chip--pending { background: var(--warning-soft); color: var(--warning); }
.chip--approved { background: var(--success-soft); color: var(--success); }
.chip--rejected { background: var(--danger-soft); color: var(--danger); }
.chip--paid { background: var(--success-soft); color: var(--success); }
.chip--draft { background: var(--bg-sunk); color: var(--ink-secondary); }
.chip--info { background: var(--info-soft); color: var(--info); }
</style>
