<script setup lang="ts">
import Icon from "./Icon.vue";
defineProps<{ amount: number; currency: string; size?: "lg" | "md" }>();
</script>
<template>
  <span :class="['amt', `amt--${size ?? 'lg'}`]">
    <Icon v-if="currency === 'SAR'" name="riyal" :size="size === 'lg' ? 22 : 16" class="amt__sym" />
    <span class="amt__num">{{ amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
    <span v-if="currency !== 'SAR'" class="amt__cur">{{ currency }}</span>
  </span>
</template>
<style scoped>
.amt { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); color: var(--ink-primary); }
.amt--lg .amt__num { font-size: 28px; line-height: 1; }
.amt--md .amt__num { font-size: 17px; line-height: 1; }
.amt__sym { color: var(--ink-secondary); flex-shrink: 0; }
.amt__cur { font-size: 11px; color: var(--ink-secondary); letter-spacing: .06em; text-transform: uppercase; }
</style>
