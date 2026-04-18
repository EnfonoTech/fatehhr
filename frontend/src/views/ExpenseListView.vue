<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import ListRow from "@/components/ListRow.vue";
import Chip from "@/components/Chip.vue";
import { useExpenseStore } from "@/stores/expense";

const { t } = useI18n();
const router = useRouter();
const store = useExpenseStore();

onMounted(() => store.loadMine());

function variantFor(status: string, approval: string) {
  if (approval === "Approved") return "approved";
  if (approval === "Rejected") return "rejected";
  if (status === "Paid") return "paid";
  if (status === "Draft") return "draft";
  return "pending";
}
</script>

<template>
  <main class="exp-list">
    <TopAppBar :title="t('expense.mine')" back @back="router.back()" />
    <SyncBar />
    <div v-for="r in store.mine" :key="r.name" class="exp-list__row">
      <ListRow
        :title="r.name"
        :subtitle="r.posting_date"
        :trailing="r.total_claimed_amount.toFixed(2)"
      />
      <Chip :variant="variantFor(r.status, r.approval_status)">
        {{ r.approval_status || r.status }}
      </Chip>
    </div>
    <p v-if="!store.mine.length" class="exp-list__empty">{{ t('expense.empty') }}</p>
    <BottomNav />
  </main>
</template>

<style scoped>
.exp-list { padding: 0 var(--page-gutter) 120px; }
.exp-list__row { margin-bottom: 8px; }
.exp-list__row > :deep(.chip) { margin: 4px 0 12px; }
.exp-list__empty { padding: 40px 0; color: var(--ink-secondary); text-align: center; }
</style>
