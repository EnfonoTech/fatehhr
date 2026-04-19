<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  label: string;
  balance: number;
  total: number;
  variant?: "primary" | "secondary";
}>();

// Fraction of the arc to fill. Clamp to [0, 1].
const pct = computed(() => {
  if (!props.total || props.total <= 0) return 0;
  return Math.max(0, Math.min(1, props.balance / props.total));
});

// Half-circle arc spans 180° (π radians). Radius = 36 in SVG units.
const R = 36;
const STROKE = 10;
const C = Math.PI * R; // half-circumference
const dash = computed(() => ({
  filled: (pct.value * C).toFixed(2),
  remaining: ((1 - pct.value) * C).toFixed(2),
}));

const fmt = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(1));
</script>

<template>
  <div class="gauge" :class="`gauge--${variant ?? 'primary'}`">
    <svg viewBox="0 0 100 60" class="gauge__svg" aria-hidden="true">
      <!-- Track -->
      <path
        d="M 14,50 A 36,36 0 0 1 86,50"
        fill="none"
        stroke="var(--bg-sunk)"
        :stroke-width="STROKE"
        stroke-linecap="round"
      />
      <!-- Filled -->
      <path
        d="M 14,50 A 36,36 0 0 1 86,50"
        fill="none"
        :stroke="variant === 'secondary' ? 'var(--ink-tertiary)' : 'var(--accent)'"
        :stroke-width="STROKE"
        stroke-linecap="round"
        :stroke-dasharray="`${dash.filled} ${dash.remaining}`"
      />
    </svg>
    <p class="gauge__ratio"><strong>{{ fmt(balance) }}</strong>/{{ fmt(total) }}</p>
    <p class="gauge__label">{{ label }}</p>
  </div>
</template>

<style scoped>
.gauge {
  background: var(--bg-surface);
  border-radius: var(--r-lg);
  box-shadow: var(--e-1);
  padding: 16px 14px 18px;
  text-align: center;
  min-width: 0;
}
.gauge__svg { width: 100%; height: auto; display: block; max-width: 120px; margin: 0 auto; }
.gauge__ratio {
  margin: 6px 0 2px;
  font-family: var(--font-mono);
  font-size: 20px;
  color: var(--ink-primary);
  letter-spacing: -0.02em;
}
.gauge__ratio strong { font-weight: 600; font-size: 22px; }
.gauge__label {
  margin: 0;
  font-size: 12px;
  color: var(--ink-secondary);
  line-height: 1.3;
}
</style>
