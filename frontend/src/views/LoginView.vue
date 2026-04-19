<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/stores/session";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import { setLocale } from "@/app/i18n";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import AppButton from "@/components/Button.vue";
import VersionBadge from "@/components/VersionBadge.vue";
import { secureGet } from "@/app/frappe";

const { t, locale } = useI18n();
const email = ref("");
const password = ref("");
const showPassword = ref(false);
const error = ref<string | null>(null);
const busy = ref(false);
const session = useSessionStore();
const router = useRouter();

const emailRef = ref<HTMLInputElement | null>(null);
const passwordRef = ref<HTMLInputElement | null>(null);

// Pre-fill email from the last successful login. When it's already known the
// user just needs to type the password, so jump focus to the password field.
// Fixes "keyboard doesn't auto-focus the password field" on saved-login.
onMounted(async () => {
  const saved = await secureGet("fatehhr.last_login_email");
  await nextTick();
  if (saved) {
    email.value = saved;
    passwordRef.value?.focus();
  } else {
    emailRef.value?.focus();
  }
});

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    const trimmed = email.value.trim();
    const resp = await authApi.login(trimmed, password.value);
    await session.applyLogin(resp);
    // Remember the email so next time we can skip straight to password focus.
    const { secureSet } = await import("@/app/frappe");
    await secureSet("fatehhr.last_login_email", trimmed);
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
        <input
          ref="emailRef"
          v-model="email"
          type="email"
          inputmode="email"
          autocomplete="username"
          autocapitalize="off"
          spellcheck="false"
          required
        />
      </label>
      <label>
        <span>{{ t("login.password") }}</span>
        <div class="login__password-wrap">
          <input
            ref="passwordRef"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            required
          />
          <button
            type="button"
            class="login__password-toggle"
            :aria-label="showPassword ? t('login.hide_password') : t('login.show_password')"
            @click="showPassword = !showPassword"
          >{{ showPassword ? '🙈' : '👁' }}</button>
        </div>
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
.login__password-wrap { position: relative; display: flex; align-items: center; }
.login__password-wrap input { flex: 1; padding-right: 44px; }
[dir="rtl"] .login__password-wrap input { padding-right: 16px; padding-left: 44px; }
.login__password-toggle {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  width: 36px; height: 36px; display: grid; place-items: center;
  color: var(--ink-secondary); font-size: 16px; background: transparent;
  border: 0; cursor: pointer; border-radius: var(--r-full);
}
.login__password-toggle:active { background: var(--bg-surface); }
[dir="rtl"] .login__password-toggle { left: 8px; right: auto; }
.login__error { color: var(--danger); margin: -4px 0 0; font-size: 13px; }
.login__lang { margin-top: 8px; color: var(--ink-secondary); font-size: 13px; }
</style>
