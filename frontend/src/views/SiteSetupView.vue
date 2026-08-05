<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import AppButton from "@/components/Button.vue";
import VersionBadge from "@/components/VersionBadge.vue";
import { setLocale } from "@/app/i18n";
import { useSessionStore } from "@/stores/session";
import { normalizeSiteUrl, setSiteUrl, siteUrl, SiteUrlError } from "@/app/platform";
import { probeSite, SiteProbeError } from "@/api/site-probe";

const { t, locale } = useI18n();
const router = useRouter();
const route = useRoute();
const session = useSessionStore();

// `?change=1` marks a deliberate re-point from More → Change server. Without it
// the router guard bounces a configured app off this screen, which is what stops
// a cold start from ever landing here (commandment 21).
const isChange = computed(() => route.query.change === "1");

const address = ref("");
const error = ref<string | null>(null);
const busy = ref(false);
const addressRef = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  // Only prefill on a deliberate change, so the user edits rather than retypes.
  // On first run the field stays empty: a prefilled address on a screen the user
  // did not ask for is the visible symptom of the cold-start bug, and seeing it
  // here would make a real regression indistinguishable from normal behaviour.
  if (isChange.value) address.value = siteUrl() ?? "";
  await nextTick();
  addressRef.value?.focus();
});

function messageFor(e: unknown): string {
  if (e instanceof SiteUrlError) return t(`setup.err_${e.code}`);
  if (e instanceof SiteProbeError) {
    // "timeout" / "unreachable" / "not-fatehhr" → three different people to call.
    return t(e.code === "not-fatehhr" ? "setup.err_not_app" : `setup.err_${e.code}`);
  }
  return t("setup.err_unreachable");
}

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    const origin = normalizeSiteUrl(address.value);
    await probeSite(origin);

    // Credentials are per-site: an api_key from the old server is meaningless on
    // the new one and would 401 on the first call. Skip the wipe when the address
    // did not actually change, so re-confirming the same server is not a logout.
    if (origin !== siteUrl()) await session.clear();

    await setSiteUrl(origin);
    router.replace({ name: "login" });
  } catch (e) {
    error.value = messageFor(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="setup">
    <TopAppBar :title="t('setup.title')" />

    <p class="setup__intro">{{ isChange ? t("setup.change_hint") : t("setup.intro") }}</p>

    <form class="setup__form" @submit.prevent="submit">
      <label>
        <span>{{ t("setup.address") }}</span>
        <input
          ref="addressRef"
          v-model="address"
          type="url"
          inputmode="url"
          :placeholder="t('setup.placeholder')"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          dir="ltr"
          required
        />
      </label>

      <p v-if="error" class="setup__error">{{ error }}</p>

      <AppButton block type="submit" :disabled="busy">
        {{ busy ? t("setup.checking") : t("setup.continue") }}
      </AppButton>

      <button
        class="setup__lang"
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
.setup { min-height: 100vh; display: flex; flex-direction: column; }
.setup__intro {
  margin: 16px var(--page-gutter) 0;
  font-size: 14px; line-height: 1.5; color: var(--ink-secondary);
}
.setup__form {
  display: flex; flex-direction: column; gap: 16px;
  padding: 20px var(--page-gutter) 0;
}
.setup__form label { display: flex; flex-direction: column; gap: 6px; }
.setup__form label span {
  font-size: 13px; color: var(--ink-secondary);
  letter-spacing: 0.02em; text-transform: uppercase;
}
.setup__form input {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md);
  padding: 14px 16px; font-size: 15px; color: var(--ink-primary);
}
.setup__form input:focus { outline: 2px solid var(--accent-ring); outline-offset: 2px; }
.setup__error { color: var(--danger); margin: -4px 0 0; font-size: 13px; line-height: 1.45; }
.setup__lang { margin-top: 8px; color: var(--ink-secondary); font-size: 13px; }
</style>
