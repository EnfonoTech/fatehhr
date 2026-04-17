import { ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/stores/session";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import { setLocale } from "@/app/i18n";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import AppButton from "@/components/Button.vue";
const { t, locale } = useI18n();
const email = ref("");
const password = ref("");
const error = ref(null);
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
    }
    catch (e) {
        error.value =
            e instanceof ApiError && e.status === 401
                ? t("login.wrong")
                : e?.message || t("login.wrong");
    }
    finally {
        busy.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['login__form']} */ ;
/** @type {__VLS_StyleScopedClasses['login__form']} */ ;
/** @type {__VLS_StyleScopedClasses['login__form']} */ ;
/** @type {__VLS_StyleScopedClasses['login__form']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "login" },
});
/** @type {[typeof TopAppBar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(TopAppBar, new TopAppBar({
    title: (__VLS_ctx.t('login.title')),
}));
const __VLS_1 = __VLS_0({
    title: (__VLS_ctx.t('login.title')),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
    ...{ onSubmit: (__VLS_ctx.submit) },
    ...{ class: "login__form" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.t("login.email"));
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    type: "email",
    autocomplete: "username",
    required: true,
});
(__VLS_ctx.email);
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.t("login.password"));
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    type: "password",
    autocomplete: "current-password",
    required: true,
});
(__VLS_ctx.password);
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "login__error" },
    });
    (__VLS_ctx.error);
}
/** @type {[typeof AppButton, typeof AppButton, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(AppButton, new AppButton({
    block: true,
    type: "submit",
    disabled: (__VLS_ctx.busy),
}));
const __VLS_4 = __VLS_3({
    block: true,
    type: "submit",
    disabled: (__VLS_ctx.busy),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
__VLS_5.slots.default;
(__VLS_ctx.t("login.continue"));
var __VLS_5;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.setLocale(__VLS_ctx.locale === 'ar' ? 'en' : 'ar');
        } },
    ...{ class: "login__lang" },
    type: "button",
});
(__VLS_ctx.locale === "ar" ? "English" : "العربية");
/** @type {__VLS_StyleScopedClasses['login']} */ ;
/** @type {__VLS_StyleScopedClasses['login__form']} */ ;
/** @type {__VLS_StyleScopedClasses['login__error']} */ ;
/** @type {__VLS_StyleScopedClasses['login__lang']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            setLocale: setLocale,
            TopAppBar: TopAppBar,
            AppButton: AppButton,
            t: t,
            locale: locale,
            email: email,
            password: password,
            error: error,
            busy: busy,
            submit: submit,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
