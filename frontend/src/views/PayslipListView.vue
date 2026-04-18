<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import SyncBar from "@/components/SyncBar.vue";
import ListRow from "@/components/ListRow.vue";
import { usePayslipStore } from "@/stores/payslip";

const { t } = useI18n();
const router = useRouter();
const store = usePayslipStore();

onMounted(() => store.loadList());
</script>

<template>
  <main>
    <TopAppBar :title="t('payslip.title')" back @back="router.back()" />
    <SyncBar />
    <div
      v-for="r in store.list"
      :key="r.name"
      class="psrow"
      @click="router.push(`/payslip/${encodeURIComponent(r.name)}`)"
    >
      <ListRow
        :title="`${r.start_date} – ${r.end_date}`"
        :subtitle="r.name"
        :trailing="r.net_pay.toFixed(2)"
      />
    </div>
    <p v-if="!store.list.length" class="empty">{{ t('payslip.empty') }}</p>
    <BottomNav />
  </main>
</template>

<style scoped>
.psrow { cursor: pointer; }
.empty { padding: 40px var(--page-gutter); color: var(--ink-secondary); text-align: center; }
</style>
