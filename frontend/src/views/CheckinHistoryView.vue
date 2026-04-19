<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Icon from "@/components/Icon.vue";
import { useCheckinStore } from "@/stores/checkin";

const { t } = useI18n();
const router = useRouter();
const store = useCheckinStore();

onMounted(() => store.loadHistory(1));

function fmt(iso: string): string {
  // Server sends naive datetimes ("2026-04-19 09:00:00") which new Date()
  // reads in the DEVICE timezone. Normalise to ISO-Z so close-together IN/OUT
  // taps render with distinct seconds regardless of locale.
  const d = new Date(iso.replace(" ", "T"));
  return d.toLocaleString(undefined, {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    day: "2-digit", month: "short",
  });
}
</script>

<template>
  <main class="hist">
    <TopAppBar :title="t('checkin.history')" back @back="router.back()" />
    <SyncBar />

    <ul v-if="store.history.length" class="hist__list">
      <li v-for="r in store.history" :key="r.name" class="hist__row">
        <span
          class="hist__icon"
          :class="r.log_type === 'IN' ? 'is-in' : 'is-out'"
        >
          <Icon :name="r.log_type === 'IN' ? 'arrow-down' : 'arrow-up'" :size="18" />
        </span>
        <span class="hist__body">
          <span class="hist__title">
            {{ r.log_type === 'IN' ? t('checkin.check_in') : t('checkin.check_out') }}
          </span>
          <span class="hist__sub">
            {{ r.__pending
              ? t('leave.pending_sync')
              : (r.custom_location_address || r.custom_task || '—') }}
          </span>
        </span>
        <time class="hist__time">{{ fmt(r.time) }}</time>
      </li>
    </ul>

    <p v-else class="hist__empty">{{ t('checkin.empty_history') }}</p>
    <BottomNav />
  </main>
</template>

<style scoped>
.hist { padding: 0 var(--page-gutter) 120px; }
.hist__list {
  list-style: none; margin: 12px 0 0; padding: 0;
  background: var(--bg-surface); border-radius: var(--r-lg);
  box-shadow: var(--e-1); overflow: hidden;
}
.hist__row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
}
.hist__row + .hist__row { border-top: 1px solid var(--hairline); }
.hist__icon {
  width: 36px; height: 36px;
  display: grid; place-items: center;
  border-radius: var(--r-full);
  flex-shrink: 0;
}
.hist__icon.is-in {
  background: var(--success-soft, #d8e8de);
  color: var(--success, #2a6b3a);
}
.hist__icon.is-out {
  background: var(--bg-sunk);
  color: var(--ink-secondary);
}
.hist__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.hist__title { font-size: 14px; font-weight: 500; color: var(--ink-primary); }
.hist__sub {
  font-size: 12px; color: var(--ink-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hist__time { font-family: var(--font-mono); font-size: 11px; color: var(--ink-tertiary); }
.hist__empty { padding: 40px var(--page-gutter); color: var(--ink-secondary); text-align: center; }
</style>
