<script setup lang="ts">
defineProps<{
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  disabled?: boolean;
  block?: boolean;
  type?: "button" | "submit";
}>();
</script>

<template>
  <button
    :type="type ?? 'button'"
    :disabled="disabled"
    class="btn"
    :class="[`btn--${variant ?? 'primary'}`, block ? 'btn--block' : '']"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  height: 48px;
  padding: 0 20px;
  border-radius: var(--r-md);
  font-weight: 500;
  font-size: 15px;
  transition: background var(--m-micro), color var(--m-micro),
              box-shadow var(--m-micro), transform var(--m-micro);
  display: inline-flex; align-items: center; justify-content: center;
}
.btn--block { width: 100%; }
.btn--primary { background: var(--accent); color: var(--accent-ink); }
.btn--primary:active { background: var(--accent-strong); }
.btn--secondary { background: transparent; color: var(--ink-primary);
  box-shadow: inset 0 0 0 1.5px var(--ink-primary); }
.btn--secondary:active { background: var(--bg-sunk); }
.btn--ghost { background: transparent; color: var(--ink-primary); }
.btn--ghost:active { background: var(--bg-sunk); }
.btn--destructive { background: transparent; color: var(--danger);
  box-shadow: inset 0 0 0 1.5px var(--danger); }
.btn--destructive:active { background: var(--danger-soft); }
.btn:disabled { opacity: 0.5; pointer-events: none; }
</style>
