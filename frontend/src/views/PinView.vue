<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/stores/session";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";

const { t } = useI18n();
const session = useSessionStore();
const router = useRouter();
const pin = ref("");
const error = ref<string | null>(null);
const busy = ref(false);
const mode = computed(() => (session.requirePinSetup ? "setup" : "verify"));
const MAX = 6;
const MIN = 4;
const visibleDots = computed(() => Math.max(MIN, Math.min(MAX, pin.value.length)));

function press(n: string) {
  if (pin.value.length < MAX) pin.value += n;
  error.value = null;
}
function backspace() {
  pin.value = pin.value.slice(0, -1);
  error.value = null;
}
async function submit() {
  if (pin.value.length < MIN) return;
  busy.value = true;
  try {
    if (mode.value === "setup") {
      await authApi.setPin(pin.value);
      await session.cachePinHash(pin.value);
      await session.markPinSet();
      await session.markPinVerified();
      router.replace({ name: "dashboard" });
      return;
    }

    // --- VERIFY path ---
    // Try local hash first. Instant, works offline, survives navigator.onLine lies.
    const localOk = await session.verifyPinLocally(pin.value);
    if (localOk) {
      await session.markPinVerified();
      router.replace({ name: "dashboard" });
      return;
    }

    // No local match → try server (first unlock on fresh device, or wrong PIN).
    if (!session.user) {
      router.replace({ name: "login" });
      return;
    }
    try {
      const r = await authApi.verifyPin(session.user, pin.value);
      await session.applyLogin({ ...r, require_pin_setup: false });
      await session.cachePinHash(pin.value);
      await session.markPinVerified();
      router.replace({ name: "dashboard" });
      return;
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) {
        error.value = t("pin.locked");
        await session.clear();
        router.replace({ name: "login" });
        return;
      }
      // 401 = real "wrong PIN" from server. Network error (fetch reject) also
      // lands here with no ApiError — since local hash didn't match either,
      // treat both as "wrong PIN, try again".
      error.value = t("pin.wrong");
      pin.value = "";
    }
  } catch {
    error.value = t("pin.wrong");
    pin.value = "";
  } finally {
    busy.value = false;
  }
}
function forgot() {
  session.clear().then(() => router.replace({ name: "login" }));
}
const title = computed(() => t(mode.value === "setup" ? "pin.setup_title" : "pin.title"));
</script>

<template>
  <main class="pin">
    <TopAppBar :title="title" />
    <p v-if="mode === 'setup'" class="pin__hint">{{ t("pin.setup_hint") }}</p>
    <div class="pin__dots">
      <span
        v-for="i in visibleDots"
        :key="i"
        class="pin__dot"
        :class="{ 'is-filled': i <= pin.length }"
      />
    </div>
    <p class="pin__count">{{ pin.length }} / 4–6</p>
    <p v-if="error" class="pin__error">{{ error }}</p>

    <div class="keypad">
      <button
        v-for="n in ['1','2','3','4','5','6','7','8','9']"
        :key="n"
        class="keypad__key"
        @click="press(n)"
      >{{ n }}</button>
      <button class="keypad__key keypad__key--ghost" @click="forgot">{{ t('pin.forgot') }}</button>
      <button class="keypad__key" @click="press('0')">0</button>
      <button class="keypad__key keypad__key--ghost" @click="backspace" aria-label="Backspace">⌫</button>
    </div>

    <div class="pin__submit" v-if="pin.length >= MIN">
      <button class="pin__submit-btn" :disabled="busy" @click="submit">
        <span>{{ mode === 'setup' ? t('pin.save') : t('pin.unlock') }}</span>
      </button>
    </div>
  </main>
</template>

<style scoped>
.pin { min-height: 100vh; display: flex; flex-direction: column; }
.pin__hint {
  text-align: center; color: var(--ink-secondary); font-size: 14px;
  margin: 4px var(--page-gutter) 0;
}
.pin__dots {
  display: flex; gap: 14px; justify-content: center; padding: 28px 0;
}
.pin__dot {
  width: 14px; height: 14px; border-radius: var(--r-full);
  background: var(--bg-sunk); box-shadow: inset 0 0 0 1px var(--hairline);
  transition: background var(--m-micro);
}
.pin__dot.is-filled { background: var(--accent); box-shadow: none; }
.pin__count { text-align: center; color: var(--ink-tertiary); font-size: 12px; margin: -12px 0 8px; font-variant-numeric: tabular-nums; }
.pin__error { color: var(--danger); text-align: center; font-size: 13px; }
.keypad {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 18px; padding: 16px var(--page-gutter) 120px;
}
.keypad__key {
  height: 72px; border-radius: var(--r-full); background: var(--bg-surface);
  box-shadow: var(--e-1); font-family: var(--font-display);
  font-size: 28px; color: var(--ink-primary);
}
.keypad__key--ghost { box-shadow: none; background: transparent; font-size: 16px; }
.keypad__key:active { background: var(--bg-sunk); transform: scale(.96); }
.pin__submit { position: fixed; bottom: calc(24px + env(safe-area-inset-bottom)); left: var(--page-gutter); right: var(--page-gutter); }
.pin__submit-btn {
  width: 100%; height: 56px; border-radius: var(--r-full);
  background: var(--accent); color: var(--accent-ink); box-shadow: var(--e-2);
  font-size: 16px; font-weight: 600; letter-spacing: 0.02em;
}
.pin__submit-btn:active { transform: translateY(1px); }
</style>
