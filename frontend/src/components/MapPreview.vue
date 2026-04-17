<script setup lang="ts">
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { onMounted, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
  latitude: number | null;
  longitude: number | null;
  interactive?: boolean;
  height?: string;
}>();

const container = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let marker: L.Marker | null = null;

onMounted(() => {
  if (!container.value) return;
  map = L.map(container.value, {
    zoomControl: false,
    dragging: !!props.interactive,
    scrollWheelZoom: !!props.interactive,
    doubleClickZoom: !!props.interactive,
    touchZoom: !!props.interactive,
    keyboard: !!props.interactive,
  }).setView([props.latitude ?? 24.7136, props.longitude ?? 46.6753], 15);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);

  if (props.latitude != null && props.longitude != null) {
    marker = L.marker([props.latitude, props.longitude]).addTo(map);
  }
});

watch(
  () => [props.latitude, props.longitude] as const,
  ([lat, lng]) => {
    if (!map) return;
    if (lat != null && lng != null) {
      if (!marker) marker = L.marker([lat, lng]).addTo(map);
      else marker.setLatLng([lat, lng]);
      map.setView([lat, lng]);
    }
  },
);

onBeforeUnmount(() => {
  map?.remove();
  map = null;
  marker = null;
});
</script>

<template>
  <div class="mapprev" :style="{ height: height ?? '180px' }" ref="container" />
</template>

<style scoped>
.mapprev {
  width: 100%; border-radius: var(--r-lg);
  box-shadow: var(--e-1); overflow: hidden;
}
</style>
