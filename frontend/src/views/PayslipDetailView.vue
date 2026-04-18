<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import AmountDisplay from "@/components/AmountDisplay.vue";
import { usePayslipStore } from "@/stores/payslip";
import { isNativePlatform } from "@/app/frappe";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = usePayslipStore();
const downloading = ref(false);

onMounted(() => store.loadDetail(String(route.params.name)));

async function download() {
  downloading.value = true;
  try {
    const blob = await store.fetchPdf(String(route.params.name));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${route.params.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    downloading.value = false;
  }
}

async function share() {
  const blob = await store.fetchPdf(String(route.params.name));
  const file = new File([blob], `${route.params.name}.pdf`, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Payslip" } as ShareData);
  } else {
    await download();
  }
}
</script>

<template>
  <main>
    <TopAppBar :title="t('payslip.detail')" back @back="router.back()" />
    <section v-if="store.current" class="ps-detail">
      <h2 class="ps-detail__hero">
        <AmountDisplay :amount="store.current.net_pay" :currency="store.current.currency" />
      </h2>
      <Card>
        <h3>{{ t('payslip.earnings') }}</h3>
        <div v-for="e in store.current.earnings" :key="e.name" class="ps-detail__line">
          <span>{{ e.name }}</span><span>{{ e.amount.toFixed(2) }}</span>
        </div>
      </Card>
      <Card>
        <h3>{{ t('payslip.deductions') }}</h3>
        <div v-for="d in store.current.deductions" :key="d.name" class="ps-detail__line">
          <span>{{ d.name }}</span><span>{{ d.amount.toFixed(2) }}</span>
        </div>
      </Card>
      <div class="ps-detail__actions">
        <AppButton @click="download" :disabled="downloading">{{ t('payslip.download') }}</AppButton>
        <AppButton variant="secondary" @click="share" v-if="!isNativePlatform()">
          {{ t('payslip.share') }}
        </AppButton>
      </div>
    </section>
    <BottomNav />
  </main>
</template>

<style scoped>
.ps-detail {
  padding: 16px var(--page-gutter); display: flex; flex-direction: column;
  gap: 12px; padding-bottom: 120px;
}
.ps-detail__hero { text-align: center; margin: 8px 0 16px; }
.ps-detail__line { display: flex; justify-content: space-between; padding: 4px 0; }
.ps-detail__line:not(:last-child) { border-bottom: 1px solid var(--hairline); }
.ps-detail__actions { display: flex; gap: 12px; justify-content: center; }
h3 { font-family: var(--font-display); font-weight: 400; font-size: 17px; margin: 0 0 8px; }
</style>
