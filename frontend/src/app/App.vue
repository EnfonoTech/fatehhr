<script setup lang="ts">
import { onMounted } from "vue";
import { RouterView, useRouter } from "vue-router";
import { installNativeBackHandler } from "./native-back";

const router = useRouter();

onMounted(() => {
  // Fire-and-forget: web builds resolve to a no-op, native build attaches
  // the Capacitor App backButton listener.
  void installNativeBackHandler(router);
});
</script>

<template>
  <RouterView />
</template>
