<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import { useProfileStore } from "@/stores/profile";
import { meApi, type SalaryPackage } from "@/api/me";

const { t } = useI18n();
const router = useRouter();
const store = useProfileStore();

const emergencyPhone = ref("");
const contact = ref("");
const relation = ref("");
const bankName = ref("");
const bankAc = ref("");
const iban = ref("");
const unmaskBank = ref(false);
const msg = ref<string | null>(null);

const personal = ref<Record<string, string | number>>({});
const salary = ref<SalaryPackage | null>(null);
const PERSONAL_ORDER = [
  "employee_number", "company", "branch", "date_of_joining", "date_of_birth", "gender", "nationality",
  "marital_status", "blood_group", "cell_number", "personal_email", "company_email", "current_address",
  "permanent_address", "custom_iqama_number", "custom_id_type", "custom_expairy_date", "passport_number",
  "valid_upto", "reports_to_name", "custom_staff_category",
];

onMounted(async () => {
  store.load();
  try { personal.value = (await meApi.personal()).fields; } catch { /* offline */ }
  try { salary.value = await meApi.salary(); } catch { /* offline */ }
});

function money(v: number | undefined, cur: string) {
  return (v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur;
}

watch(
  () => store.profile,
  (p) => {
    if (!p) return;
    emergencyPhone.value = p.emergency_phone_number ?? "";
    contact.value = p.person_to_be_contacted ?? "";
    relation.value = p.relation ?? "";
    bankName.value = p.bank_name ?? "";
    bankAc.value = p.bank_ac_no ?? "";
    iban.value = p.iban ?? "";
  },
  { immediate: true },
);

function mask(s: string) {
  if (!s) return "";
  return s.length <= 4 ? "•".repeat(s.length) : "•".repeat(s.length - 4) + s.slice(-4);
}

async function save() {
  const r = await store.update({
    emergency_phone_number: emergencyPhone.value,
    person_to_be_contacted: contact.value,
    relation: relation.value,
    bank_name: bankName.value,
    bank_ac_no: bankAc.value,
    iban: iban.value,
  });
  msg.value = r.mode === "online" ? t("profile.saved") : t("profile.queued");
}
</script>

<template>
  <main v-if="store.profile" class="profile">
    <TopAppBar :title="t('profile.title')" back @back="router.back()" />
    <header class="profile__header">
      <div
        class="profile__avatar"
        :style="{ backgroundImage: store.profile.photo ? `url(${store.profile.photo})` : '' }"
      ></div>
      <h2>{{ store.profile.full_name }}</h2>
      <p>{{ [store.profile.designation, store.profile.department].filter(Boolean).join(' · ') }}</p>
    </header>

    <Card v-if="Object.keys(personal).length">
      <h3>{{ t('profile.personal') }}</h3>
      <dl class="profile__facts">
        <template v-for="k in PERSONAL_ORDER" :key="k">
          <template v-if="personal[k]"><dt>{{ t(`profile.f.${k}`) }}</dt><dd>{{ personal[k] }}</dd></template>
        </template>
      </dl>
    </Card>

    <Card v-if="salary?.allowed">
      <h3>{{ t('profile.salary') }}</h3>
      <p class="profile__note">{{ t('profile.salary_note') }}</p>
      <dl class="profile__facts">
        <template v-if="salary.ctc"><dt>{{ t('profile.ctc') }}</dt><dd>{{ money(salary.ctc, salary.current?.currency ?? 'SAR') }}</dd></template>
        <template v-if="salary.current">
          <dt>{{ t('profile.effective_from') }}</dt><dd>{{ salary.current.from_date }}</dd>
          <dt class="profile__group">{{ t('profile.earnings') }}</dt><dd></dd>
          <template v-for="e in salary.current.earnings" :key="e.label"><dt>{{ e.label }}</dt><dd>{{ money(e.value, salary.current.currency) }}</dd></template>
          <dt><b>{{ t('profile.total_earnings') }}</b></dt><dd><b>{{ money(salary.current.total_earnings, salary.current.currency) }}</b></dd>
          <template v-if="salary.current.deductions.length">
            <dt class="profile__group">{{ t('profile.deductions') }}</dt><dd></dd>
            <template v-for="d in salary.current.deductions" :key="d.label"><dt>{{ d.label }}</dt><dd>{{ money(d.value, salary.current.currency) }}</dd></template>
            <dt><b>{{ t('profile.total_deductions') }}</b></dt><dd><b>{{ money(salary.current.total_deductions, salary.current.currency) }}</b></dd>
          </template>
          <dt><b>{{ t('profile.net_fixed') }}</b></dt><dd><b>{{ money(salary.current.net_fixed, salary.current.currency) }}</b></dd>
        </template>
      </dl>
      <p v-if="!salary.current && !salary.ctc" class="profile__note">{{ t('profile.no_salary') }}</p>
      <AppButton variant="secondary" block @click="router.push('/payslip')">{{ t('profile.payslips') }}</AppButton>
    </Card>

    <Card>
      <h3>{{ t('profile.emergency') }}</h3>
      <label><span>{{ t('profile.emergency_contact') }}</span><input v-model="contact" /></label>
      <label><span>{{ t('profile.relation') }}</span><input v-model="relation" /></label>
      <label><span>{{ t('profile.phone') }}</span><input v-model="emergencyPhone" /></label>
    </Card>

    <Card>
      <div class="profile__bank-head">
        <h3>{{ t('profile.bank') }}</h3>
        <AppButton variant="ghost" @click="unmaskBank = !unmaskBank">
          {{ unmaskBank ? t('profile.hide') : t('profile.show') }}
        </AppButton>
      </div>
      <label><span>{{ t('profile.bank_name') }}</span><input v-model="bankName" /></label>
      <label><span>{{ t('profile.bank_ac') }}</span>
        <input v-if="unmaskBank" v-model="bankAc" />
        <input v-else disabled :value="mask(bankAc)" /></label>
      <label><span>IBAN</span>
        <input v-if="unmaskBank" v-model="iban" />
        <input v-else disabled :value="mask(iban)" /></label>
    </Card>

    <AppButton block @click="save">{{ t('profile.save') }}</AppButton>
    <p v-if="msg" class="profile__msg">{{ msg }}</p>

    <BottomNav />
  </main>
</template>

<style scoped>
.profile { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.profile__header { text-align: center; padding: 8px 0 12px; }
.profile__avatar {
  width: 96px; height: 96px; border-radius: var(--r-full);
  margin: 8px auto 12px; background: var(--bg-sunk) center/cover;
}
.profile__header h2 { font-family: var(--font-display); font-weight: 400; font-size: 24px; margin: 0 0 2px; }
.profile__header p { color: var(--ink-secondary); margin: 0; }
.profile__bank-head { display: flex; align-items: center; justify-content: space-between; }
h3 { font-family: var(--font-display); font-weight: 400; font-size: 17px; margin: 0 0 8px; }
label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
label span { font-size: 12px; color: var(--ink-secondary); text-transform: uppercase; }
input {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md);
  padding: 12px; font-size: 15px; color: var(--ink-primary);
}
.profile__facts { display: grid; grid-template-columns: 1fr 1.2fr; gap: 6px 12px; margin: 0 0 8px; font-size: 14px; }
.profile__facts dt { color: var(--ink-secondary); }
.profile__facts dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.profile__group { grid-column: 1 / -1; margin-top: 6px; font-weight: 600; color: var(--ink-primary) !important; }
.profile__note { color: var(--ink-secondary); font-size: 13px; margin: 0 0 8px; }
.profile__msg { color: var(--ink-secondary); font-size: 13px; text-align: center; }
</style>
