<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/stores/session";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import { setLocale } from "@/app/i18n";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import AppButton from "@/components/Button.vue";
import VersionBadge from "@/components/VersionBadge.vue";

const { t, locale } = useI18n();
const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const busy = ref(false);
const session = useSessionStore();
const router = useRouter();

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    const resp = await authApi.login(email.value.trim(), password.value);
    await session.applyLogin(resp);
    router.replace({ name: resp.require_pin_setup ? "pin" : "pin" });
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 401
        ? t("login.wrong")
        : (e as Error)?.message || t("login.wrong");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="login">
    <TopAppBar :title="t('login.title')" />
    <form class="login__form" @submit.prevent="submit">
      <label>
        <span>{{ t("login.email") }}</span>
        <input v-model="email" type="email" autocomplete="username" required />
      </label>
      <label>
        <span>{{ t("login.password") }}</span>
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="login__error">{{ error }}</p>
      <AppButton block type="submit" :disabled="busy">{{ t("login.continue") }}</AppButton>
      <button
        class="login__lang"
        type="button"
        @click="setLocale(locale === 'ar' ? 'en' : 'ar')"
      >
        {{ locale === "ar" ? "English" : "العربية" }}
      </button>
    </form>
    <VersionBadge />
  </main>
</template>

<style scoped>
.login { min-height: 100vh; display: flex; flex-direction: column; }
.login__form {
  display: flex; flex-direction: column; gap: 16px;
  padding: 24px var(--page-gutter) 0;
}
.login__form label { display: flex; flex-direction: column; gap: 6px; }
.login__form label span {
  font-size: 13px; color: var(--ink-secondary);
  letter-spacing: 0.02em; text-transform: uppercase;
}
.login__form input {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md);
  padding: 14px 16px; font-size: 15px; color: var(--ink-primary);
}
.login__form input:focus {
  outline: 2px solid var(--accent-ring); outline-offset: 2px;
}
.login__error { color: var(--danger); margin: -4px 0 0; font-size: 13px; }
.login__lang { margin-top: 8px; color: var(--ink-secondary); font-size: 13px; }
</style>
