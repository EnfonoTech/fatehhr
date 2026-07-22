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
import { checkinApi, type SiteOption } from "@/api/checkin";
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
const activityLog = ref<string | null>(null);
// Cooperheat multi-site: allocated sites for the IN picker; open IN's site for OUT.
const siteOptions = ref<SiteOption[]>([]);
const site = ref<string | null>(null);
const openSiteName = ref<string | null>(null);
// Employee time-adjust: local-wall-clock "YYYY-MM-DDTHH:mm" for <input datetime-local>.
// Defaults to now; the employee may backdate the punch up to 24h.
const punchTime = ref<string>("");
const busy = ref(false);
const message = ref<string | null>(null);
const geofence = ref<"disabled" | "inside" | "outside" | "unknown">("unknown");

const timerMode = computed(() => settings.isTimerBased);

// --- Employee time-adjust (24h window) -------------------------------------
// <input datetime-local> speaks local wall-clock with no timezone. Format/parse
// against the device's local tz, then convert the chosen value to ISO-UTC for
// the server (which stores site-local; _parse_client_ts handles the offset).
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Lower bound = 24h before now (spec §7 fixed 24h employee window); upper = now.
const punchMin = computed(() => toLocalInput(new Date(Date.now() - 24 * 60 * 60 * 1000)));
const punchMax = computed(() => toLocalInput(new Date()));

onMounted(async () => {
  await settings.refresh();
  await store.refreshToday();
  // Default the punch time to now; the employee may backdate up to 24h.
  punchTime.value = toLocalInput(new Date());
  // Cooperheat multi-site: sites for the IN picker; open IN's site for OUT label.
  try {
    siteOptions.value = await checkinApi.assignedSites();
    if (siteOptions.value.length === 1) site.value = siteOptions.value[0].project;
  } catch { /* offline / non-cooperheat → no picker */ }
  try {
    const oc = await checkinApi.openCheckin();
    openSiteName.value = oc?.project_name ?? null;
  } catch { /* offline */ }
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
  // Multi-site: a project site is required on check-IN when sites are allocated.
  if (nextLogType.value === "IN" && siteOptions.value.length && !site.value) {
    await hapticError();
    message.value = t("checkin.site_required");
    return;
  }

  // Employee time-adjust: send the chosen punch time only when the employee
  // actually backdated it (>1min from now); otherwise let the server stamp the
  // real tap moment. Enforce the 24h lower bound + no-future here too (the
  // input's min/max is not honoured by every mobile keyboard).
  let adjustedIso: string | null = null;
  if (punchTime.value) {
    const chosenMs = new Date(punchTime.value).getTime();
    const nowMs = Date.now();
    if (Number.isNaN(chosenMs)) {
      await hapticError();
      message.value = t("checkin.time_out_of_range");
      return;
    }
    if (Math.abs(nowMs - chosenMs) > 60_000) {
      if (chosenMs > nowMs + 120_000 || chosenMs < nowMs - 24 * 60 * 60 * 1000) {
        await hapticError();
        message.value = t("checkin.time_out_of_range");
        return;
      }
      adjustedIso = new Date(chosenMs).toISOString();
    }
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
      activity_log: nextLogType.value === "OUT" ? activityLog.value : null,
      project_site: nextLogType.value === "IN" ? site.value : null,
      adjusted_time: adjustedIso,
    });
    await hapticMedium();
    message.value = res.mode === "online" ? t("checkin.done") : t("checkin.queued");
    if (res.mode === "online" && res.row) {
      geofence.value = res.row.custom_geofence_status;
    }
    selfiePhotoId.value = null;
    activityLog.value = null;
    punchTime.value = toLocalInput(new Date());
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
      await tasks.stop(activityLog.value);
    }
    await hapticMedium();
    message.value = t("checkin.done");
    selfiePhotoId.value = null;
    activityLog.value = null;
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

    <!-- Multi-site: pick the site on check-IN -->
    <section v-if="nextLogType === 'IN' && siteOptions.length" class="checkin__site">
      <h3>{{ t('checkin.site') }}</h3>
      <select v-model="site" class="checkin__site-select">
        <option :value="null" disabled>{{ t('checkin.site_select') }}</option>
        <option v-for="s in siteOptions" :key="s.project" :value="s.project">{{ s.project_name }}</option>
      </select>
    </section>
    <!-- Check-OUT: site is fixed to the open check-in, shown read-only -->
    <p v-else-if="nextLogType === 'OUT' && openSiteName" class="checkin__site-readonly">
      {{ t('checkin.site') }}: <strong>{{ openSiteName }}</strong>
    </p>

    <!-- Employee time-adjust: backdate the punch up to 24h (checkin mode only) -->
    <section v-if="!timerMode" class="checkin__time">
      <h3>{{ t('checkin.time') }}</h3>
      <p class="checkin__time-hint">{{ t('checkin.time_hint') }}</p>
      <input
        v-model="punchTime"
        type="datetime-local"
        class="checkin__time-input"
        :min="punchMin"
        :max="punchMax"
      />
    </section>

    <section v-if="nextLogType === 'OUT'" class="checkin__activity">
      <h3>{{ t('checkin.activity_log') }}</h3>
      <p class="checkin__activity-hint">{{ t('checkin.activity_hint') }}</p>
      <textarea
        v-model="activityLog"
        class="checkin__activity-input"
        rows="4"
        :placeholder="t('checkin.activity_placeholder')"
      ></textarea>
    </section>

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
.checkin__activity h3 {
  font-family: var(--font-display); font-size: 17px;
  margin: 16px 0 4px; font-weight: 400;
}
.checkin__activity-hint {
  color: var(--ink-secondary); font-size: 13px; margin: 0 0 8px;
}
.checkin__activity-input {
  width: 100%; box-sizing: border-box; resize: vertical;
  padding: 10px 12px; font: inherit; color: var(--ink-primary);
  background: var(--bg-surface); border: 1px solid var(--hairline);
  border-radius: var(--r-md);
}
.checkin__activity-input:focus {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring);
}
.checkin__site h3 { font-family: var(--font-display); font-size: 17px; margin: 16px 0 8px; font-weight: 400; }
.checkin__site-select {
  width: 100%; box-sizing: border-box; padding: 12px; font: inherit;
  color: var(--ink-primary); background: var(--bg-surface);
  border: 1px solid var(--hairline); border-radius: var(--r-md);
}
.checkin__site-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
.checkin__site-readonly { margin: 12px 0 0; font-size: 14px; color: var(--ink-secondary); }
.checkin__site-readonly strong { color: var(--ink-primary); }
.checkin__time h3 { font-family: var(--font-display); font-size: 17px; margin: 16px 0 4px; font-weight: 400; }
.checkin__time-hint { color: var(--ink-secondary); font-size: 13px; margin: 0 0 8px; }
.checkin__time-input {
  width: 100%; box-sizing: border-box; padding: 12px; font: inherit;
  color: var(--ink-primary); background: var(--bg-surface);
  border: 1px solid var(--hairline); border-radius: var(--r-md);
}
.checkin__time-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
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
