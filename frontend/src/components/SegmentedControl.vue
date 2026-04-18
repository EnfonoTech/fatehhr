<script setup lang="ts">
defineProps<{ options: { label: string; value: string }[]; modelValue: string }>();
defineEmits<{ "update:modelValue": [v: string] }>();
</script>

<template>
  <div class="seg">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      :class="['seg__btn', { 'is-active': modelValue === o.value }]"
      @click="$emit('update:modelValue', o.value)"
    >{{ o.label }}</button>
  </div>
</template>

<style scoped>
.seg { display: inline-flex; background: var(--bg-sunk); border-radius: var(--r-md); padding: 3px; }
.seg__btn {
  padding: 8px 14px; font-size: 13px;
  border-radius: calc(var(--r-md) - 2px); color: var(--ink-secondary);
}
.seg__btn.is-active {
  background: var(--bg-surface); box-shadow: var(--e-1); color: var(--ink-primary);
}
</style>
