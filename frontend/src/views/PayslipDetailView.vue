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
import { isNativePlatform, saveBlobToDevice } from "@/app/frappe";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = usePayslipStore();
const downloading = ref(false);
const message = ref<string | null>(null);

onMounted(() => store.loadDetail(String(route.params.name)));

async function download() {
  downloading.value = true;
  message.value = null;
  try {
    const blob = await store.fetchPdf(String(route.params.name));
    const res = await saveBlobToDevice(blob, `${route.params.name}.pdf`);
    if (isNativePlatform() && res.uri) {
      message.value = "Saved to Documents.";
    } else {
      message.value = "Downloaded.";
    }
  } catch (e) {
    message.value = (e as Error)?.message ?? "Download failed.";
  } finally {
    downloading.value = false;
  }
}

async function share() {
  try {
    const blob = await store.fetchPdf(String(route.params.name));
    const file = new File([blob], `${route.params.name}.pdf`, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Payslip" } as ShareData);
    } else {
      await download();
    }
  } catch (e) {
    message.value = (e as Error)?.message ?? "Share failed.";
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
        <AppButton variant="secondary" @click="share">
          {{ t('payslip.share') }}
        </AppButton>
      </div>
      <p v-if="message" class="ps-detail__msg">{{ message }}</p>
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
.ps-detail__msg { text-align: center; color: var(--ink-secondary); font-size: 13px; margin: 4px 0 0; }
h3 { font-family: var(--font-display); font-weight: 400; font-size: 17px; margin: 0 0 8px; }
</style>
