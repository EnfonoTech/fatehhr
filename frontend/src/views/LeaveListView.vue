<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import ListRow from "@/components/ListRow.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import { useLeaveStore } from "@/stores/leave";

const { t } = useI18n();
const router = useRouter();
const store = useLeaveStore();

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

    <div v-for="r in store.mine" :key="r.name" class="leave-list__row">
      <ListRow
        :title="r.leave_type"
        :subtitle="`${r.from_date} → ${r.to_date}`"
        :trailing="`${r.total_leave_days}d`"
      />
      <div class="leave-list__meta">
        <Chip :variant="variantFor(r.status)">{{ r.status }}</Chip>
        <AppButton v-if="r.status === 'Open'" variant="ghost" @click="cancel(r.name)">
          {{ t('leave.cancel') }}
        </AppButton>
      </div>
    </div>

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
.leave-list__row { padding-bottom: 8px; }
.leave-list__meta { display: flex; align-items: center; gap: 8px; padding: 4px 0 12px; }
.leave-list__empty { padding: 40px 0; color: var(--ink-secondary); text-align: center; }
</style>
