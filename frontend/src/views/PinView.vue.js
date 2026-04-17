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
const error = ref(null);
const busy = ref(false);
const mode = computed(() => (session.requirePinSetup ? "setup" : "verify"));
const MAX = 6;
const MIN = 4;
function press(n) {
    if (pin.value.length < MAX)
        pin.value += n;
    error.value = null;
}
function backspace() {
    pin.value = pin.value.slice(0, -1);
    error.value = null;
}
async function submit() {
    if (pin.value.length < MIN)
        return;
    busy.value = true;
    try {
        if (mode.value === "setup") {
            await authApi.setPin(pin.value);
            await session.cachePinHash(pin.value);
            session.requirePinSetup = false;
            session.markPinVerified();
            router.replace({ name: "dashboard" });
            return;
        }
        if (!navigator.onLine) {
            const ok = await session.verifyPinLocally(pin.value);
            if (!ok) {
                error.value = t("pin.wrong");
                pin.value = "";
                return;
            }
            session.markPinVerified();
            router.replace({ name: "dashboard" });
            return;
        }
        if (!session.user) {
            router.replace({ name: "login" });
            return;
        }
        const r = await authApi.verifyPin(session.user, pin.value);
        await session.applyLogin({ ...r, require_pin_setup: false });
        await session.cachePinHash(pin.value);
        session.markPinVerified();
        router.replace({ name: "dashboard" });
    }
    catch (e) {
        if (e instanceof ApiError && e.status === 423) {
            error.value = t("pin.locked");
            await session.clear();
            router.replace({ name: "login" });
            return;
        }
        error.value = t("pin.wrong");
        pin.value = "";
    }
    finally {
        busy.value = false;
    }
}
function forgot() {
    session.clear().then(() => router.replace({ name: "login" }));
}
const title = computed(() => t(mode.value === "setup" ? "pin.setup_title" : "pin.title"));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['pin__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['keypad__key']} */ ;
/** @type {__VLS_StyleScopedClasses['pin__submit']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "pin" },
});
/** @type {[typeof TopAppBar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(TopAppBar, new TopAppBar({
    title: (__VLS_ctx.title),
}));
const __VLS_1 = __VLS_0({
    title: (__VLS_ctx.title),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
if (__VLS_ctx.mode === 'setup') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "pin__hint" },
    });
    (__VLS_ctx.t("pin.setup_hint"));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pin__dots" },
});
for (const [i] of __VLS_getVForSourceType((__VLS_ctx.MAX))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        key: (i),
        ...{ class: "pin__dot" },
        ...{ class: ({ 'is-filled': i <= __VLS_ctx.pin.length }) },
    });
}
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "pin__error" },
    });
    (__VLS_ctx.error);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "keypad" },
});
for (const [n] of __VLS_getVForSourceType((['1', '2', '3', '4', '5', '6', '7', '8', '9']))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.press(n);
            } },
        key: (n),
        ...{ class: "keypad__key" },
    });
    (n);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.forgot) },
    ...{ class: "keypad__key keypad__key--ghost" },
});
(__VLS_ctx.t('pin.forgot'));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.press('0');
        } },
    ...{ class: "keypad__key" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.backspace) },
    ...{ class: "keypad__key keypad__key--ghost" },
    'aria-label': "Backspace",
});
if (__VLS_ctx.pin.length >= __VLS_ctx.MIN) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pin__submit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.submit) },
        ...{ class: "pin__submit-btn" },
        disabled: (__VLS_ctx.busy),
    });
    (__VLS_ctx.mode === 'setup' ? '✓' : '→');
}
/** @type {__VLS_StyleScopedClasses['pin']} */ ;
/** @type {__VLS_StyleScopedClasses['pin__hint']} */ ;
/** @type {__VLS_StyleScopedClasses['pin__dots']} */ ;
/** @type {__VLS_StyleScopedClasses['pin__dot']} */ ;
/** @type {__VLS_StyleScopedClasses['pin__error']} */ ;
/** @type {__VLS_StyleScopedClasses['keypad']} */ ;
/** @type {__VLS_StyleScopedClasses['keypad__key']} */ ;
/** @type {__VLS_StyleScopedClasses['keypad__key']} */ ;
/** @type {__VLS_StyleScopedClasses['keypad__key--ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['keypad__key']} */ ;
/** @type {__VLS_StyleScopedClasses['keypad__key']} */ ;
/** @type {__VLS_StyleScopedClasses['keypad__key--ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['pin__submit']} */ ;
/** @type {__VLS_StyleScopedClasses['pin__submit-btn']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            TopAppBar: TopAppBar,
            t: t,
            pin: pin,
            error: error,
            busy: busy,
            mode: mode,
            MAX: MAX,
            MIN: MIN,
            press: press,
            backspace: backspace,
            submit: submit,
            forgot: forgot,
            title: title,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
