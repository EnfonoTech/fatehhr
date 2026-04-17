import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
const { t } = useI18n();
const tabs = [
    { to: "/", key: "nav.home", icon: "◉" },
    { to: "/checkin", key: "nav.attendance", icon: "◎" },
    { to: "/leave", key: "nav.leave", icon: "◈" },
    { to: "/tasks", key: "nav.tasks", icon: "◆" },
    { to: "/settings", key: "nav.more", icon: "⋯" },
];
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['bnav__tab']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "bnav" },
});
for (const [t2] of __VLS_getVForSourceType((__VLS_ctx.tabs))) {
    const __VLS_0 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        key: (t2.to),
        to: (t2.to),
        ...{ class: "bnav__tab" },
    }));
    const __VLS_2 = __VLS_1({
        key: (t2.to),
        to: (t2.to),
        ...{ class: "bnav__tab" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "bnav__icon" },
    });
    (t2.icon);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "bnav__label" },
    });
    (__VLS_ctx.t(t2.key));
    var __VLS_3;
}
/** @type {__VLS_StyleScopedClasses['bnav']} */ ;
/** @type {__VLS_StyleScopedClasses['bnav__tab']} */ ;
/** @type {__VLS_StyleScopedClasses['bnav__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['bnav__label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            RouterLink: RouterLink,
            t: t,
            tabs: tabs,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
