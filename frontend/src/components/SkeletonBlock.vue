<script setup lang="ts">
defineProps<{ height?: string; width?: string; radius?: string }>();
</script>
<template>
  <div class="skel" :style="{ height: height ?? '16px', width: width ?? '100%', borderRadius: radius ?? 'var(--r-md)' }" />
</template>
<style scoped>
.skel {
  background: linear-gradient(90deg, var(--bg-sunk), var(--hairline), var(--bg-sunk));
  background-size: 200% 100%;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse { 0% { background-position: 0 0; } 100% { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skel { animation: none; background: var(--bg-sunk); } }
</style>
