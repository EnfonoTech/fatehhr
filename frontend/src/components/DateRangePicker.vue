<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{ from: string | null; to: string | null; singleDay?: boolean }>();
const emit = defineEmits<{ "update:from": [v: string]; "update:to": [v: string] }>();

const fromRef = ref(props.from ?? "");
const toRef = ref(props.to ?? "");
watch(() => props.from, (v) => (fromRef.value = v ?? ""));
watch(() => props.to, (v) => (toRef.value = v ?? ""));
</script>

<template>
  <div class="drp">
    <label>
      <span>{{ singleDay ? "Date" : "From" }}</span>
      <input
        type="date"
        v-model="fromRef"
        @change="emit('update:from', fromRef); if (singleDay) emit('update:to', fromRef)"
      />
    </label>
    <label v-if="!singleDay">
      <span>To</span>
      <input type="date" v-model="toRef" @change="emit('update:to', toRef)" />
    </label>
  </div>
</template>

<style scoped>
.drp { display: flex; gap: 12px; }
.drp label { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.drp label span {
  font-size: 12px; color: var(--ink-secondary);
  letter-spacing: .04em; text-transform: uppercase;
}
.drp input {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md);
  padding: 12px; font-size: 15px; color: var(--ink-primary);
}
</style>
