<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import { requestApi } from "@/api/request";
import { errorMessage } from "@/api/client";

const { t } = useI18n();
const router = useRouter();
const subject = ref("");
const details = ref("");
const busy = ref(false);
const error = ref<string | null>(null);

async function send() {
  if (!subject.value.trim() || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const r = await requestApi.create(subject.value.trim(), details.value.trim());
    router.replace(`/request/${encodeURIComponent(r.name)}`);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="rn">
    <TopAppBar :title="t('request.new')" back @back="router.back()" />
    <p class="rn__intro">{{ t("request.intro") }}</p>
    <Card>
      <label><span>{{ t("request.subject") }}</span>
        <input v-model="subject" :placeholder="t('request.subject_hint')" maxlength="140" /></label>
      <label><span>{{ t("request.details") }}</span>
        <textarea v-model="details" rows="5" /></label>
    </Card>
    <AppButton block :disabled="!subject.trim() || busy" @click="send">{{ t("request.send") }}</AppButton>
    <p v-if="error" class="rn__error">{{ error }}</p>
    <BottomNav />
  </main>
</template>

<style scoped>
.rn { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.rn__intro { color: var(--ink-secondary); font-size: 14px; margin: 0; }
label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
label span { font-size: 12px; color: var(--ink-secondary); text-transform: uppercase; }
input, textarea {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md); padding: 12px; font-size: 15px;
  color: var(--ink-primary); font-family: inherit;
}
.rn__error { color: var(--danger); font-size: 13px; text-align: center; }
</style>
