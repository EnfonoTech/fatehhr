<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/stores/session";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import VersionBadge from "@/components/VersionBadge.vue";
import Icon from "@/components/Icon.vue";
import {
  getBiometricInfo,
  verifyBiometric,
  enrollBiometric,
  type BiometricInfo,
} from "@/app/biometric";

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

const bio = ref<BiometricInfo>({ available: false, enrolled: false, label: "Biometric" });
const enrollPromptOpen = ref(false);

onMounted(async () => {
  bio.value = await getBiometricInfo();
  // Verify mode + already enrolled → auto-prompt biometric so the user doesn't
  // have to tap the button first. Fall back to PIN pad on failure.
  if (mode.value === "verify" && bio.value.enrolled) {
    const ok = await verifyBiometric();
    if (ok) {
      await session.markPinVerified();
      router.replace({ name: "dashboard" });
    }
  }
});

async function useBiometric() {
  const ok = await verifyBiometric();
  if (ok) {
    await session.markPinVerified();
    router.replace({ name: "dashboard" });
  } else {
    error.value = t("pin.wrong");
  }
}

async function enrollAfterSetup() {
  enrollPromptOpen.value = false;
  const ok = await enrollBiometric();
  if (ok) {
    bio.value = await getBiometricInfo();
  }
  router.replace({ name: "dashboard" });
}

function skipEnroll() {
  enrollPromptOpen.value = false;
  router.replace({ name: "dashboard" });
}

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
      // If biometric hardware is available and the user hasn't already
      // enrolled, offer it once. Otherwise go straight to dashboard.
      if (bio.value.available && !bio.value.enrolled) {
        enrollPromptOpen.value = true;
      } else {
        router.replace({ name: "dashboard" });
      }
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

    <!-- Biometric unlock shortcut (verify mode) -->
    <button
      v-if="mode === 'verify' && bio.enrolled && pin.length < MIN"
      class="pin__bio"
      type="button"
      @click="useBiometric"
    >
      <span class="pin__bio-icon"><Icon name="user" :size="22" /></span>
      <span class="pin__bio-label">{{ t('pin.use_biometric', { label: bio.label }) }}</span>
    </button>

    <!-- Enrolment prompt after successful PIN setup -->
    <div v-if="enrollPromptOpen" class="pin__enroll">
      <div class="pin__enroll-card">
        <h3>{{ t('pin.enroll_title', { label: bio.label }) }}</h3>
        <p>{{ t('pin.enroll_body', { label: bio.label }) }}</p>
        <div class="pin__enroll-row">
          <button class="pin__enroll-skip" type="button" @click="skipEnroll">
            {{ t('pin.enroll_skip') }}
          </button>
          <button class="pin__enroll-go" type="button" @click="enrollAfterSetup">
            {{ t('pin.enroll_go', { label: bio.label }) }}
          </button>
        </div>
      </div>
    </div>

    <VersionBadge />
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

.pin__bio {
  position: fixed; bottom: calc(28px + env(safe-area-inset-bottom));
  left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  padding: 10px 18px; border-radius: var(--r-full);
  background: var(--bg-surface); box-shadow: var(--e-1);
  border: 0; cursor: pointer;
  color: var(--ink-primary); font-size: 14px; font-weight: 500;
}
.pin__bio:active { background: var(--bg-sunk); transform: translateX(-50%) scale(0.97); }
.pin__bio-icon {
  width: 36px; height: 36px; display: grid; place-items: center;
  border-radius: var(--r-full);
  background: var(--accent-soft, #e8f0ee); color: var(--accent, #2E5D5A);
}

.pin__enroll {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  display: grid; place-items: center; z-index: 200;
  padding: 24px;
}
.pin__enroll-card {
  background: var(--bg-surface); border-radius: var(--r-lg);
  padding: 24px; max-width: 360px; width: 100%;
  box-shadow: var(--e-3);
}
.pin__enroll-card h3 {
  font-family: var(--font-display); font-weight: 500; font-size: 18px;
  margin: 0 0 8px; letter-spacing: -0.01em;
}
.pin__enroll-card p {
  margin: 0 0 20px; color: var(--ink-secondary); font-size: 14px; line-height: 1.5;
}
.pin__enroll-row { display: flex; gap: 10px; justify-content: flex-end; }
.pin__enroll-skip {
  padding: 10px 16px; border-radius: var(--r-full);
  background: transparent; border: 0;
  color: var(--ink-secondary); font-size: 14px; cursor: pointer;
}
.pin__enroll-go {
  padding: 10px 20px; border-radius: var(--r-full);
  background: var(--accent, #2E5D5A); color: var(--accent-ink, #fff);
  border: 0; font-size: 14px; font-weight: 500; cursor: pointer;
}
</style>
