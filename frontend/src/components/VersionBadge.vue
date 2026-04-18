<script setup lang="ts">
import { NATIVE_VERSION } from "@/app/native-version";

const buildTag = __BUILD_TAG__;
</script>

<template>
  <p class="ver" aria-label="Build version">v{{ NATIVE_VERSION }} · {{ buildTag }}</p>
</template>

<style scoped>
.ver {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-tertiary);
  letter-spacing: 0.06em;
  text-align: center;
  margin: 16px 0 0;
  user-select: text;
}
</style>
