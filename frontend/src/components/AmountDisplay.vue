<script setup lang="ts">
defineProps<{ amount: number; currency: string; size?: "lg" | "md" }>();
</script>
<template>
  <span :class="['amt', `amt--${size ?? 'lg'}`]">
    <span class="amt__num">{{ amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
    <span class="amt__cur">{{ currency }}</span>
  </span>
</template>
<style scoped>
.amt { display: inline-flex; align-items: baseline; gap: 8px; font-family: var(--font-mono); color: var(--ink-primary); }
.amt--lg .amt__num { font-size: 28px; }
.amt--md .amt__num { font-size: 17px; }
.amt__cur { font-size: 11px; color: var(--ink-secondary); letter-spacing: .06em; text-transform: uppercase; }
</style>
