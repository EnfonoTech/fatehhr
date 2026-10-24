<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import { requestApi, type Person, type RequestDetail } from "@/api/request";
import { errorMessage } from "@/api/client";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const name = computed(() => String(route.params.name));
const doc = ref<RequestDetail | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

const sheet = ref<null | "forward" | "complete" | "reject">(null);
const note = ref("");
const query = ref("");
const people = ref<Person[]>([]);
const chosen = ref<Person | null>(null);
let timer: number | undefined;

async function load() {
  try {
    doc.value = await requestApi.detail(name.value);
  } catch (e) {
    error.value = errorMessage(e);
  }
}
onMounted(load);

function open(kind: "forward" | "complete" | "reject") {
  sheet.value = kind;
  note.value = "";
  chosen.value = null;
  query.value = "";
  people.value = [];
  if (kind === "forward") search();
}

function search() {
  window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    try { people.value = await requestApi.people(query.value.trim()); } catch { /* offline */ }
  }, 250);
}

async function confirm() {
  if (!sheet.value || busy.value) return;
  if (sheet.value === "forward" && !chosen.value) return;
  busy.value = true;
  error.value = null;
  try {
    if (sheet.value === "forward") await requestApi.forward(name.value, chosen.value!.name, note.value);
    else if (sheet.value === "complete") await requestApi.complete(name.value, note.value);
    else await requestApi.reject(name.value, note.value);
    sheet.value = null;
    await load();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

function variant(s: string) {
  return s === "Completed" ? "approved" : s === "Rejected" ? "rejected" : "pending";
}
function fmt(iso: string) {
  return new Date(iso.replace(" ", "T")).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function stepText(s: RequestDetail["trail"][number]) {
  if (s.action === "Created") return `${t("request.created")} · ${t("request.to")} ${s.to_name ?? "—"}`;
  if (s.action === "Forwarded") return `${s.from_name ?? "—"} → ${s.to_name ?? "—"}`;
  return `${t(`request.${s.action.toLowerCase()}`)} · ${s.from_name ?? ""}`;
}
</script>

<template>
  <main class="rd">
    <TopAppBar :title="doc?.name ?? t('request.title')" back @back="router.push('/request')" />
    <template v-if="doc">
      <Card>
        <div class="rd__head">
          <h2>{{ doc.subject }}</h2>
          <Chip :variant="variant(doc.status)" dot>{{ t(`request.status_${doc.status}`) }}</Chip>
        </div>
        <p class="rd__meta">{{ t("request.by") }} {{ doc.requested_by_name }} · {{ fmt(doc.creation) }}</p>
        <p v-if="doc.status === 'Open'" class="rd__meta">{{ t("request.with") }} <b>{{ doc.holder_name ?? "—" }}</b></p>
        <div v-if="doc.details" class="rd__details" v-html="doc.details" />
      </Card>

      <div v-if="doc.can_act" class="rd__actions">
        <AppButton block @click="open('forward')">{{ t("request.forward") }}</AppButton>
        <div class="rd__pair">
          <AppButton variant="secondary" block @click="open('complete')">{{ t("request.complete") }}</AppButton>
          <AppButton variant="destructive" block @click="open('reject')">{{ t("request.reject") }}</AppButton>
        </div>
      </div>

      <Card>
        <h3>{{ t("request.trail") }}</h3>
        <ol class="rd__trail">
          <li v-for="(s, i) in doc.trail" :key="i">
            <div class="rd__step">{{ stepText(s) }}</div>
            <div class="rd__when">{{ fmt(s.time) }}</div>
            <div v-if="s.comment" class="rd__comment">{{ s.comment }}</div>
          </li>
        </ol>
      </Card>
    </template>
    <p v-if="error" class="rd__error">{{ error }}</p>

    <BottomSheet :open="!!sheet" :title="sheet ? t(`request.${sheet}`) : ''" @close="sheet = null">
      <template v-if="sheet === 'forward'">
        <label><span>{{ t("request.forward_to") }}</span>
          <input v-model="query" :placeholder="t('request.search_people')" @input="search" /></label>
        <ul class="rd__people">
          <li v-for="p in people" :key="p.name" :class="{ 'is-on': chosen?.name === p.name }" @click="chosen = p">
            <b>{{ p.employee_name }}</b>
            <span>{{ [p.designation, p.department].filter(Boolean).join(" · ") }}</span>
          </li>
        </ul>
      </template>
      <label><span>{{ t("request.note") }}</span><textarea v-model="note" rows="3" /></label>
      <AppButton block :disabled="busy || (sheet === 'forward' && !chosen)" @click="confirm">{{ sheet ? t(`request.${sheet}`) : "" }}</AppButton>
    </BottomSheet>
    <BottomNav />
  </main>
</template>

<style scoped>
.rd { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.rd__head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.rd__head h2 { font-family: var(--font-display); font-weight: 400; font-size: 20px; margin: 0; overflow-wrap: anywhere; }
.rd__meta { color: var(--ink-secondary); font-size: 13px; margin: 6px 0 0; }
.rd__details { margin-top: 10px; font-size: 14px; overflow-wrap: anywhere; }
.rd__actions { display: flex; flex-direction: column; gap: 8px; }
.rd__pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
h3 { font-family: var(--font-display); font-weight: 400; font-size: 17px; margin: 0 0 8px; }
.rd__trail { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.rd__step { font-weight: 600; font-size: 14px; }
.rd__when { font-size: 12px; color: var(--ink-secondary); }
.rd__comment { font-size: 13px; background: var(--bg-sunk); border-radius: var(--r-md); padding: 8px 10px; margin-top: 4px; }
.rd__error { color: var(--danger); font-size: 13px; text-align: center; }
label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
label span { font-size: 12px; color: var(--ink-secondary); text-transform: uppercase; }
input, textarea {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md); padding: 12px; font-size: 15px;
  color: var(--ink-primary); font-family: inherit;
}
.rd__people { list-style: none; margin: 0 0 10px; padding: 0; max-height: 34vh; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.rd__people li { padding: 10px 12px; border-radius: var(--r-md); background: var(--bg-sunk); display: flex; flex-direction: column; cursor: pointer; }
.rd__people li span { font-size: 12px; color: var(--ink-secondary); }
.rd__people li.is-on { outline: 2px solid var(--accent, #CE0A0D); }
</style>
