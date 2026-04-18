<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import ListRow from "@/components/ListRow.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import { useLeaveStore } from "@/stores/leave";
import type { LeaveRow } from "@/api/leave";

const { t } = useI18n();
const router = useRouter();
const store = useLeaveStore();

const selected = ref<LeaveRow | null>(null);
function open(row: LeaveRow) { selected.value = row; }

onMounted(() => store.loadMine());

function variantFor(status: string) {
  const m: Record<string, "pending" | "approved" | "rejected" | "draft" | "neutral"> = {
    Open: "pending",
    Approved: "approved",
    Rejected: "rejected",
    Cancelled: "draft",
  };
  return m[status] ?? "neutral";
}

async function cancel(name: string) {
  if (!confirm(t("leave.cancel_confirm"))) return;
  try {
    await store.cancel(name);
  } catch (e) {
    alert((e as Error)?.message || "error");
  }
}
</script>

<template>
  <main class="leave-list">
    <TopAppBar :title="t('leave.mine')" back @back="router.back()" />
    <SyncBar />

    <div class="leave-list__tabs">
      <RouterLink to="/leave" class="tab">{{ t('leave.apply') }}</RouterLink>
      <RouterLink to="/leave/mine" class="tab is-active">{{ t('leave.mine') }}</RouterLink>
    </div>

    <div
      v-for="r in store.mine"
      :key="r.name"
      class="leave-list__row"
      @click="open(r)"
    >
      <ListRow
        :title="r.leave_type"
        :subtitle="`${r.from_date} → ${r.to_date}`"
        :trailing="`${r.total_leave_days}d`"
      />
      <div class="leave-list__meta">
        <Chip :variant="variantFor(r.status)">{{ r.status }}</Chip>
      </div>
    </div>

    <BottomSheet :open="!!selected" :title="selected?.leave_type" @close="selected = null">
      <template v-if="selected">
        <dl class="leave-list__dl">
          <div><dt>{{ t('leave.type') }}</dt><dd>{{ selected.leave_type }}</dd></div>
          <div><dt>{{ t('leave.period') }}</dt><dd>{{ selected.from_date }} → {{ selected.to_date }}</dd></div>
          <div><dt>{{ t('leave.days') }}</dt><dd>{{ selected.total_leave_days }}</dd></div>
          <div v-if="selected.half_day"><dt>{{ t('leave.half_day') }}</dt><dd>✓</dd></div>
          <div><dt>{{ t('leave.status_label') }}</dt><dd><Chip :variant="variantFor(selected.status)">{{ selected.status }}</Chip></dd></div>
          <div v-if="selected.description">
            <dt>{{ t('leave.reason') }}</dt><dd>{{ selected.description }}</dd>
          </div>
        </dl>
        <AppButton
          v-if="selected.status === 'Open'"
          variant="destructive"
          block
          @click="cancel(selected.name); selected = null;"
        >{{ t('leave.cancel') }}</AppButton>
      </template>
    </BottomSheet>

    <div v-for="p in store.pendingLocal" :key="p.draftId" class="leave-list__row">
      <ListRow :title="p.leave_type" :subtitle="`${p.from_date} → ${p.to_date}`" />
      <Chip variant="pending">{{ t('leave.pending_sync') }}</Chip>
    </div>

    <p v-if="!store.mine.length && !store.pendingLocal.length" class="leave-list__empty">
      {{ t('leave.empty') }}
    </p>

    <BottomNav />
  </main>
</template>

<style scoped>
.leave-list { padding: 0 var(--page-gutter) 120px; }
.leave-list__tabs { display: flex; gap: 8px; margin: 8px 0 16px; }
.leave-list__tabs .tab {
  padding: 8px 14px; font-size: 13px; border-radius: var(--r-md);
  background: var(--bg-sunk); color: var(--ink-secondary); text-decoration: none;
}
.leave-list__tabs .tab.is-active, .leave-list__tabs .tab.router-link-exact-active {
  background: var(--bg-surface); box-shadow: var(--e-1); color: var(--ink-primary);
}
.leave-list__row { padding-bottom: 8px; cursor: pointer; }
.leave-list__meta { display: flex; align-items: center; gap: 8px; padding: 4px 0 12px; }
.leave-list__empty { padding: 40px 0; color: var(--ink-secondary); text-align: center; }
.leave-list__dl { margin: 0 0 12px; display: flex; flex-direction: column; gap: 10px; }
.leave-list__dl > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.leave-list__dl dt {
  font-size: 12px; color: var(--ink-secondary);
  text-transform: uppercase; letter-spacing: .04em;
}
.leave-list__dl dd { margin: 0; font-size: 14px; color: var(--ink-primary); text-align: right; }
[dir="rtl"] .leave-list__dl dd { text-align: left; }
</style>
