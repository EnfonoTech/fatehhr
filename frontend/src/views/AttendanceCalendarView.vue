<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import Card from "@/components/Card.vue";
import { useAttendanceStore } from "@/stores/attendance";

const { t } = useI18n();
const router = useRouter();
const store = useAttendanceStore();

const now = new Date();
const year = ref(now.getFullYear());
const month = ref(now.getMonth() + 1);
const selectedDate = ref<string | null>(null);

onMounted(() => store.loadMonth(year.value, month.value));

const days = computed(() => store.current?.days ?? []);
const summary = computed(() => store.current?.summary);

/** Cold-start: before store.loadMonth resolves, show skeleton cells so the
 *  month grid's shape is visible instantly (bug #10 — "blank for 2-3 seconds
 *  on first open"). We render one cell per day-of-month for the active month. */
const skeletonCells = computed(() => {
  if (days.value.length) return [];
  const y = year.value;
  const m = month.value;
  const daysInMonth = new Date(y, m, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => i + 1);
});

function prev() {
  if (month.value === 1) { month.value = 12; year.value--; }
  else month.value--;
  store.loadMonth(year.value, month.value);
}
function next() {
  if (month.value === 12) { month.value = 1; year.value++; }
  else month.value++;
  store.loadMonth(year.value, month.value);
}

function statusClass(s: string): string {
  const map: Record<string, string> = {
    Present: "is-present",
    Absent: "is-absent",
    "Half Day": "is-half",
    "On Leave": "is-leave",
    Holiday: "is-holiday",
    Weekend: "is-weekend",
  };
  return map[s] ?? "";
}

function tap(d: string) {
  selectedDate.value = d;
}

function fmtHM(iso: string): string {
  if (!iso) return "";
  // Server now ships UTC-ISO ("…Z"); fall back to naive parse for legacy.
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
const selected = computed(() =>
  selectedDate.value ? store.dayFor(selectedDate.value) : null,
);
</script>

<template>
  <main class="cal">
    <TopAppBar :title="t('attendance.title')" back @back="router.back()" />
    <SyncBar />
    <header class="cal__head">
      <button class="cal__nav" @click="prev" aria-label="Previous">‹</button>
      <h2>{{ year }} / {{ String(month).padStart(2, "0") }}</h2>
      <button class="cal__nav" @click="next" aria-label="Next">›</button>
    </header>

    <div class="cal__grid">
      <div
        v-for="d in days"
        :key="d.date"
        :class="['cal__cell', statusClass(d.status)]"
        @click="tap(d.date)"
      >
        <span class="cal__dow">{{ Number(d.date.slice(-2)) }}</span>
      </div>
      <!-- Skeleton cells until the first month response comes in -->
      <div
        v-for="n in skeletonCells"
        :key="`sk-${n}`"
        class="cal__cell cal__cell--skel"
      >
        <span class="cal__dow">{{ n }}</span>
      </div>
    </div>

    <Card v-if="summary" class="cal__summary">
      <div><strong>{{ summary.present }}</strong> {{ t("attendance.present") }}</div>
      <div><strong>{{ summary.absent }}</strong> {{ t("attendance.absent") }}</div>
      <div><strong>{{ summary.on_leave }}</strong> {{ t("attendance.on_leave") }}</div>
      <div><strong>{{ summary.total_hours.toFixed(1) }}</strong> {{ t("attendance.hours") }}</div>
    </Card>

    <BottomSheet :open="!!selected" :title="selected?.date" @close="selectedDate = null">
      <template v-if="selected">
        <p>{{ t("attendance.status") }}: <strong>{{ selected.status || "—" }}</strong></p>
        <p>{{ t("attendance.hours") }}: <strong>{{ selected.hours_worked.toFixed(2) }}</strong></p>
        <ul class="cal__pairs" v-if="selected.pairs.length">
          <li v-for="(p, i) in selected.pairs" :key="i">
            {{ fmtHM(p.in) }} → {{ fmtHM(p.out) }}
            · {{ p.task ?? t("attendance.no_task") }}
            <em v-if="p.open_pair_autoclosed">({{ t("attendance.autoclosed") }})</em>
          </li>
        </ul>
        <p v-else class="cal__empty">{{ t("attendance.no_pairs") }}</p>
      </template>
    </BottomSheet>

    <BottomNav />
  </main>
</template>

<style scoped>
.cal { padding: 0 var(--page-gutter) 120px; }
.cal__head {
  display: flex; align-items: center; justify-content: space-between; padding: 12px 0;
}
.cal__head h2 {
  font-family: var(--font-display); font-weight: 400; font-size: 22px; margin: 0;
}
.cal__nav {
  width: 40px; height: 40px; border-radius: var(--r-full);
  font-size: 20px; color: var(--ink-primary);
}
.cal__nav:active { background: var(--bg-sunk); }
[dir="rtl"] .cal__nav { transform: scaleX(-1); }
.cal__grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.cal__cell {
  aspect-ratio: 1 / 1; border-radius: var(--r-md);
  background: var(--bg-sunk); display: grid; place-items: center;
  color: var(--ink-secondary); font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.cal__cell.is-present { background: #D8E8DE; color: var(--success); }
.cal__cell.is-absent { background: #F2DBD6; color: var(--danger); }
.cal__cell.is-half { background: #F2E4C7; color: var(--warning); }
.cal__cell.is-leave { background: #D8E0EA; color: var(--info); }
.cal__cell.is-holiday { background: var(--hairline); color: var(--ink-tertiary); }
.cal__cell.is-weekend { background: var(--bg-sunk); color: var(--ink-tertiary); }
.cal__cell--skel {
  animation: cal-pulse 1.2s ease-in-out infinite;
  color: var(--ink-tertiary);
}
@keyframes cal-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.cal__summary {
  margin-top: 16px; display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 8px; text-align: center;
}
.cal__summary strong { display: block; font-family: var(--font-mono); font-size: 18px; }
.cal__summary > div { font-size: 11px; color: var(--ink-secondary); text-transform: uppercase; letter-spacing: .04em; }
.cal__pairs { padding-left: 16px; }
.cal__empty { color: var(--ink-secondary); font-size: 13px; }
</style>
