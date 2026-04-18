<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import VersionBadge from "@/components/VersionBadge.vue";
import { useProfileStore } from "@/stores/profile";
import { useSessionStore } from "@/stores/session";
import { setLocale } from "@/app/i18n";

const { t, locale } = useI18n();
const router = useRouter();
const profile = useProfileStore();
const session = useSessionStore();

onMounted(() => profile.load());

const p = computed(() => profile.profile);

function mask(s?: string | null) {
  if (!s) return "—";
  return s.length <= 4 ? "•".repeat(s.length) : "•".repeat(s.length - 4) + s.slice(-4);
}

async function logout() {
  await session.clear();
  router.replace({ name: "login" });
}
</script>

<template>
  <main class="more">
    <TopAppBar :title="t('more.title')" />

    <!-- Profile card (read-only, loaded from ERPNext Employee) -->
    <Card class="more__profile">
      <div class="more__avatar" :style="{ backgroundImage: p?.photo ? `url(${p.photo})` : '' }">
        <span v-if="!p?.photo" class="more__avatar-initials">
          {{ (p?.full_name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() }}
        </span>
      </div>
      <h2 class="more__name">{{ p?.full_name || t('more.loading') }}</h2>
      <p class="more__role">
        {{ [p?.designation, p?.department].filter(Boolean).join(' · ') || '—' }}
      </p>
      <p class="more__id" v-if="p?.employee_id">{{ p.employee_id }}</p>
    </Card>

    <Card v-if="p" class="more__section">
      <h3>{{ t('more.contact') }}</h3>
      <dl>
        <div><dt>{{ t('more.email') }}</dt><dd>{{ p.user }}</dd></div>
        <div v-if="p.emergency_phone_number"><dt>{{ t('more.emergency_phone') }}</dt><dd>{{ p.emergency_phone_number }}</dd></div>
        <div v-if="p.person_to_be_contacted"><dt>{{ t('more.emergency_contact') }}</dt><dd>{{ p.person_to_be_contacted }}</dd></div>
        <div v-if="p.relation"><dt>{{ t('more.relation') }}</dt><dd>{{ p.relation }}</dd></div>
      </dl>
    </Card>

    <Card v-if="p?.bank_name || p?.bank_ac_no || p?.iban" class="more__section">
      <h3>{{ t('more.bank') }}</h3>
      <dl>
        <div v-if="p.bank_name"><dt>{{ t('more.bank_name') }}</dt><dd>{{ p.bank_name }}</dd></div>
        <div v-if="p.bank_ac_no"><dt>{{ t('more.bank_ac') }}</dt><dd>{{ mask(p.bank_ac_no) }}</dd></div>
        <div v-if="p.iban"><dt>IBAN</dt><dd>{{ mask(p.iban) }}</dd></div>
      </dl>
      <p class="more__hint">{{ t('more.read_only_hint') }}</p>
    </Card>

    <Card class="more__section">
      <h3>{{ t('more.language') }}</h3>
      <div class="more__lang-row">
        <AppButton :variant="locale === 'en' ? 'primary' : 'ghost'" @click="setLocale('en')">English</AppButton>
        <AppButton :variant="locale === 'ar' ? 'primary' : 'ghost'" @click="setLocale('ar')">العربية</AppButton>
      </div>
    </Card>

    <AppButton block variant="destructive" class="more__logout" @click="logout">
      {{ t('more.logout') }}
    </AppButton>

    <VersionBadge />
    <BottomNav />
  </main>
</template>

<style scoped>
.more { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.more__profile { text-align: center; padding: 20px 16px; }
.more__avatar {
  width: 80px; height: 80px; border-radius: var(--r-full);
  margin: 4px auto 12px; background: var(--bg-sunk) center/cover;
  display: grid; place-items: center;
  box-shadow: var(--e-1);
}
.more__avatar-initials {
  font-family: var(--font-display); font-size: 26px;
  font-weight: 500; color: var(--ink-primary);
}
.more__name {
  margin: 0; font-family: var(--font-display);
  font-weight: 400; font-size: 20px; letter-spacing: -0.01em;
}
.more__role { margin: 2px 0 0; color: var(--ink-secondary); font-size: 13px; }
.more__id {
  margin: 8px auto 0; display: inline-block;
  font-family: var(--font-mono); font-size: 11px;
  color: var(--ink-tertiary); background: var(--bg-sunk);
  padding: 3px 8px; border-radius: var(--r-full);
}
.more__section h3 {
  font-family: var(--font-display); font-weight: 400;
  font-size: 15px; margin: 0 0 10px; color: var(--ink-primary);
}
.more__section dl { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.more__section dl > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.more__section dt { font-size: 12px; color: var(--ink-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.more__section dd { margin: 0; font-size: 14px; color: var(--ink-primary); text-align: right; }
[dir="rtl"] .more__section dd { text-align: left; }
.more__hint { margin: 10px 0 0; font-size: 11px; color: var(--ink-tertiary); }
.more__lang-row { display: flex; gap: 8px; }
.more__logout { margin-top: 12px; }
</style>
