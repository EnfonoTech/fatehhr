<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import AppButton from "@/components/Button.vue";
import SyncBar from "@/components/SyncBar.vue";
import MapPreview from "@/components/MapPreview.vue";
import PhotoSlot from "@/components/PhotoSlot.vue";
import BottomNav from "@/components/BottomNav.vue";
import { useCheckinStore } from "@/stores/checkin";
import { getCurrentCoords, hapticMedium, hapticError } from "@/app/frappe";
import { utilApi } from "@/api/util";
import { classify } from "@/offline/geofence-shim";
import { CUSTOMER_SELFIE_MODE } from "virtual:fatehhr-theme";

const { t } = useI18n();
const store = useCheckinStore();
const router = useRouter();
const lat = ref<number | null>(null);
const lng = ref<number | null>(null);
const address = ref<string | null>(null);
const task = ref<string | null>(null);
const selfiePhotoId = ref<string | null>(null);
const busy = ref(false);
const message = ref<string | null>(null);
const geofence = ref<"disabled" | "inside" | "outside" | "unknown">("unknown");

onMounted(async () => {
  await store.refreshToday();
  const coords = await getCurrentCoords();
  if (coords) {
    lat.value = coords.latitude;
    lng.value = coords.longitude;
    try {
      const g = await utilApi.reverseGeocode(coords.latitude, coords.longitude);
      address.value = g.address;
    } catch {
      /* offline */
    }
  }
  geofence.value = classify(null, null, null, lat.value, lng.value);
});

const needsSelfie = computed(() => {
  if (CUSTOMER_SELFIE_MODE === "every") return true;
  if (CUSTOMER_SELFIE_MODE === "first") return store.currentStatus !== "IN";
  return false;
});

const nextLogType = computed<"IN" | "OUT">(() =>
  store.currentStatus === "IN" ? "OUT" : "IN",
);

async function submit() {
  if (needsSelfie.value && !selfiePhotoId.value) {
    await hapticError();
    message.value = t("checkin.selfie_required");
    return;
  }

  // Re-fetch coords at tap time if we don't have them yet.
  // Fixes: GPS permission granted late, or initial fetch failed silently.
  if (lat.value == null || lng.value == null) {
    message.value = t("checkin.getting_location");
    const coords = await getCurrentCoords();
    if (coords) {
      lat.value = coords.latitude;
      lng.value = coords.longitude;
      try {
        const g = await utilApi.reverseGeocode(coords.latitude, coords.longitude);
        address.value = g.address;
      } catch {
        /* offline — keep raw coords */
      }
    } else {
      await hapticError();
      message.value = t("checkin.location_required");
      return;
    }
  }

  busy.value = true;
  message.value = null;
  try {
    const res = await store.submit({
      log_type: nextLogType.value,
      latitude: lat.value,
      longitude: lng.value,
      address: address.value,
      task: task.value,
      selfie_photo_id: selfiePhotoId.value,
    });
    await hapticMedium();
    message.value = res.mode === "online" ? t("checkin.done") : t("checkin.queued");
    if (res.mode === "online" && res.row) {
      geofence.value = res.row.custom_geofence_status;
    }
    selfiePhotoId.value = null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="checkin">
    <TopAppBar :title="t('checkin.title')" back @back="router.back()" />
    <SyncBar />
    <MapPreview :latitude="lat" :longitude="lng" height="200px" />
    <p class="checkin__address">{{ address ?? t('checkin.unknown_location') }}</p>

    <p class="checkin__geofence" :class="`is-${geofence}`">
      {{ t(`checkin.geofence.${geofence}`) }}
    </p>

    <section v-if="needsSelfie" class="checkin__selfie">
      <h3>{{ t('checkin.selfie') }}</h3>
      <PhotoSlot v-model="selfiePhotoId" aspect="3:4" />
    </section>

    <AppButton block @click="submit" :disabled="busy">
      {{ nextLogType === 'IN' ? t('checkin.check_in') : t('checkin.check_out') }}
    </AppButton>
    <p v-if="message" class="checkin__msg">{{ message }}</p>

    <RouterLink to="/checkin/history" class="checkin__history-link">
      {{ t('checkin.history') }} →
    </RouterLink>

    <BottomNav />
  </main>
</template>

<style scoped>
.checkin { padding: 0 var(--page-gutter) 120px; }
.checkin__address { margin: 8px 0 0; color: var(--ink-secondary); }
.checkin__geofence {
  margin: 12px 0; font-size: 13px; padding: 8px 12px;
  border-radius: var(--r-full); display: inline-block;
}
.checkin__geofence.is-inside { background: var(--success-soft); color: var(--success); }
.checkin__geofence.is-outside { background: var(--warning-soft); color: var(--warning); }
.checkin__geofence.is-unknown { background: var(--hairline); color: var(--ink-secondary); }
.checkin__geofence.is-disabled { background: var(--bg-sunk); color: var(--ink-secondary); }
.checkin__selfie h3 {
  font-family: var(--font-display); font-size: 17px;
  margin: 16px 0 8px; font-weight: 400;
}
.checkin__msg { color: var(--ink-secondary); font-size: 13px; margin: 8px 0 0; text-align: center; }
.checkin__history-link {
  display: block; margin: 24px 0 0; color: var(--ink-secondary); text-align: center;
}
</style>
