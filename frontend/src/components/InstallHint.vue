<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { CUSTOMER_BRAND_NAME } from "virtual:fatehhr-theme";
import { isNative } from "@/app/platform";
import { dismissInstallHint, installHint, readInstallEnv, type InstallHint } from "@/app/install-hint";

const { t } = useI18n();
const hint = ref<InstallHint>("none");

onMounted(() => {
  hint.value = installHint(readInstallEnv(isNative()));
});

function close() {
  dismissInstallHint();
  hint.value = "none";
}
</script>

<template>
  <aside v-if="hint !== 'none'" class="ih" role="dialog" :aria-label="t('install.title', { app: CUSTOMER_BRAND_NAME })">
    <button class="ih__close" :aria-label="t('install.close')" @click="close">×</button>
    <p class="ih__title">{{ t("install.title", { app: CUSTOMER_BRAND_NAME }) }}</p>

    <p v-if="hint === 'open-in-safari'" class="ih__step">{{ t("install.open_in_safari") }}</p>

    <ol v-else class="ih__steps">
      <li class="ih__step">
        {{ t("install.step_share_before") }}
        <svg class="ih__glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v12M8 7l4-4 4 4" />
          <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
        </svg>
        <strong>{{ t("install.share") }}</strong>
      </li>
      <li class="ih__step">
        {{ t("install.step_add_before") }}
        <svg class="ih__glyph" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <path d="M12 8v8M8 12h8" />
        </svg>
        <strong>{{ t("install.add_to_home") }}</strong>
      </li>
    </ol>
  </aside>
</template>

<style scoped>
.ih {
  position: fixed; left: 12px; right: 12px;
  bottom: calc(84px + env(safe-area-inset-bottom));
  z-index: 20;
  padding: 14px 40px 14px 16px;
  background: var(--bg-surface); color: var(--ink-primary);
  border-radius: var(--r-lg); box-shadow: var(--e-3);
  border-inline-start: 4px solid var(--accent);
  font-size: 14px; line-height: 1.4;
}
.ih__title { margin: 0 0 6px; font-weight: 600; }
.ih__steps { margin: 0; padding-inline-start: 20px; }
.ih__step { margin: 4px 0 0; color: var(--ink-secondary); }
.ih__step strong { color: var(--ink-primary); }
.ih__glyph {
  width: 18px; height: 18px; vertical-align: -4px; margin: 0 2px;
  fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
}
.ih__close {
  position: absolute; top: 6px; inset-inline-end: 6px;
  width: 32px; height: 32px; border-radius: var(--r-full);
  background: transparent; color: var(--ink-secondary); font-size: 22px; line-height: 1;
}
</style>
