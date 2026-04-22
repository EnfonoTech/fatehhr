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
import { useSettingsStore } from "@/stores/settings";
import { useTasksStore } from "@/stores/tasks";
import { getCurrentCoords, hapticMedium, hapticError } from "@/app/frappe";
import { utilApi } from "@/api/util";
import { classify } from "@/offline/geofence-shim";
import { CUSTOMER_SELFIE_MODE } from "virtual:fatehhr-theme";

const { t } = useI18n();
const store = useCheckinStore();
const settings = useSettingsStore();
const tasks = useTasksStore();
const router = useRouter();
const lat = ref<number | null>(null);
const lng = ref<number | null>(null);
const address = ref<string | null>(null);
const task = ref<string | null>(null);
const selfiePhotoId = ref<string | null>(null);
const busy = ref(false);
const message = ref<string | null>(null);
const geofence = ref<"disabled" | "inside" | "outside" | "unknown">("unknown");

const timerMode = computed(() => settings.isTimerBased);

onMounted(async () => {
  await settings.refresh();
  await store.refreshToday();
  if (timerMode.value) {
    await tasks.load();
    // If a timer is already running, default the pick to that task so the
    // button reads "Check Out" semantically.
    if (tasks.running) task.value = tasks.running.task;
  }
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
  if (CUSTOMER_SELFIE_MODE === "first") return nextLogType.value === "IN";
  return false;
});

// Next action is a Check Out if:
//   * Timer mode: there's a running timer (user is IN via timer)
//   * Checkin mode: store.currentStatus is IN
const nextLogType = computed<"IN" | "OUT">(() => {
  if (timerMode.value) return tasks.running ? "OUT" : "IN";
  return store.currentStatus === "IN" ? "OUT" : "IN";
});

async function submit() {
  if (timerMode.value) return submitTimerMode();
  return submitCheckinMode();
}

async function submitCheckinMode() {
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
    window.setTimeout(() => {
      if (router.currentRoute.value.name === "checkin") {
        router.replace("/");
      }
    }, 800);
  } finally {
    busy.value = false;
  }
}

// Timer-based attendance: Check-In starts a Task Timer (server writes
// Employee Checkin IN + Timesheet row), Check-Out stops the running
// timer (server writes Employee Checkin OUT + closes the row).
async function submitTimerMode() {
  // Coords still captured for geofence & the IN/OUT row, but selfie is
  // optional in this mode because the tap semantics are "start work on
  // this task". Rulebook: only capture selfie if policy = every.
  if (CUSTOMER_SELFIE_MODE === "every" && !selfiePhotoId.value) {
    await hapticError();
    message.value = t("checkin.selfie_required");
    return;
  }

  if (nextLogType.value === "IN") {
    if (!task.value) {
      await hapticError();
      message.value = t("dashboard.pick_task_hint");
      return;
    }
    if (!tasks.tasks.find((x) => x.name === task.value)) {
      await hapticError();
      message.value = t("tasks.empty");
      return;
    }
  }

  // Fetch coords if not yet resolved.
  if (lat.value == null || lng.value == null) {
    const coords = await getCurrentCoords();
    if (coords) {
      lat.value = coords.latitude;
      lng.value = coords.longitude;
    }
  }

  busy.value = true;
  message.value = null;
  try {
    if (nextLogType.value === "IN") {
      await tasks.start(task.value as string);
    } else {
      await tasks.stop();
    }
    await hapticMedium();
    message.value = t("checkin.done");
    selfiePhotoId.value = null;
    window.setTimeout(() => {
      if (router.currentRoute.value.name === "checkin") {
        router.replace("/");
      }
    }, 800);
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

    <section v-if="timerMode && nextLogType === 'IN'" class="checkin__pick">
      <h3>{{ t('dashboard.pick_task') }}</h3>
      <p class="checkin__pick-hint">{{ t('dashboard.pick_task_hint') }}</p>
      <p v-if="!tasks.tasks.length" class="checkin__pick-empty">
        {{ t('tasks.empty') }}
      </p>
      <ul v-else class="checkin__pick-list">
        <li v-for="tk in tasks.tasks" :key="tk.name">
          <button
            type="button"
            class="checkin__pick-item"
            :class="{ 'is-selected': task === tk.name }"
            @click="task = tk.name"
          >
            <span class="checkin__pick-title">{{ tk.subject }}</span>
            <span class="checkin__pick-meta">
              {{ tk.project || '' }}{{ tk.exp_end_date ? ' · ' + tk.exp_end_date : '' }}
            </span>
          </button>
        </li>
      </ul>
    </section>

    <section v-if="timerMode && nextLogType === 'OUT' && tasks.running" class="checkin__running">
      <h3>{{ tasks.tasks.find(x => x.name === tasks.running?.task)?.subject || tasks.running?.task }}</h3>
      <p class="checkin__running-meta">{{ t('tasks.title') }} · {{ tasks.elapsed() }}</p>
    </section>

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

.checkin__pick h3,
.checkin__running h3 {
  font-family: var(--font-display); font-size: 17px;
  margin: 16px 0 4px; font-weight: 400;
}
.checkin__pick-hint {
  color: var(--ink-secondary); font-size: 13px; margin: 0 0 8px;
}
.checkin__pick-empty {
  padding: 16px; text-align: center;
  color: var(--ink-secondary); font-size: 13px;
  background: var(--bg-sunk); border-radius: var(--r-md);
}
.checkin__pick-list {
  list-style: none; margin: 0 0 12px; padding: 0;
  display: flex; flex-direction: column; gap: 6px;
}
.checkin__pick-item {
  width: 100%; display: flex; flex-direction: column; align-items: flex-start;
  gap: 2px; padding: 10px 12px;
  background: var(--bg-surface); border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  font: inherit; text-align: start; cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.checkin__pick-item.is-selected {
  border-color: var(--accent, #2a6b3a);
  background: var(--accent-soft, #d8e8de);
}
.checkin__pick-title {
  font-size: 14px; font-weight: 500; color: var(--ink-primary);
}
.checkin__pick-meta {
  font-size: 12px; color: var(--ink-secondary);
}
.checkin__running {
  background: var(--bg-surface); border-radius: var(--r-lg);
  padding: 12px 14px; box-shadow: var(--e-1); margin: 8px 0 12px;
}
.checkin__running-meta {
  margin: 0; color: var(--ink-secondary); font-family: var(--font-mono); font-size: 13px;
}
</style>
