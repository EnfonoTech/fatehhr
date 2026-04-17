import { onMounted, ref, computed } from "vue";
import { useSessionStore } from "@/stores/session";
import { meApi } from "@/api/me";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
const { t } = useI18n();
const session = useSessionStore();
const profile = ref(null);
const greetingKey = computed(() => {
    const h = new Date().getHours();
    if (h < 12)
        return "dashboard.greeting_morning";
    if (h < 17)
        return "dashboard.greeting_afternoon";
    return "dashboard.greeting_evening";
});
onMounted(async () => {
    try {
        profile.value = await meApi.profile();
    }
    catch {
        /* Phase 1 swallow */
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['dashboard__greeting']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "dashboard" },
});
/** @type {[typeof TopAppBar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(TopAppBar, new TopAppBar({
    title: (__VLS_ctx.t('app.name')),
}));
const __VLS_1 = __VLS_0({
    title: (__VLS_ctx.t('app.name')),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "dashboard__greeting" },
});
(__VLS_ctx.t(__VLS_ctx.greetingKey, { name: __VLS_ctx.profile?.full_name || __VLS_ctx.session.user || '' }));
if (__VLS_ctx.profile?.designation || __VLS_ctx.profile?.department) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "dashboard__meta" },
    });
    ([__VLS_ctx.profile?.designation, __VLS_ctx.profile?.department].filter(Boolean).join(" · "));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "dashboard__stub" },
});
(__VLS_ctx.t('dashboard.stub'));
/** @type {__VLS_StyleScopedClasses['dashboard']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard__greeting']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard__meta']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard__stub']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            TopAppBar: TopAppBar,
            t: t,
            session: session,
            profile: profile,
            greetingKey: greetingKey,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
