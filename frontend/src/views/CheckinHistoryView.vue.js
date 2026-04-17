import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import ListRow from "@/components/ListRow.vue";
import BottomNav from "@/components/BottomNav.vue";
import { useCheckinStore } from "@/stores/checkin";
const { t } = useI18n();
const router = useRouter();
const store = useCheckinStore();
onMounted(() => store.loadHistory(1));
function fmt(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        hour: "2-digit", minute: "2-digit",
        day: "2-digit", month: "short",
    });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "hist" },
});
/** @type {[typeof TopAppBar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(TopAppBar, new TopAppBar({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.t('checkin.history')),
    back: true,
}));
const __VLS_1 = __VLS_0({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.t('checkin.history')),
    back: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onBack: (...[$event]) => {
        __VLS_ctx.router.back();
    }
};
var __VLS_2;
/** @type {[typeof SyncBar, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(SyncBar, new SyncBar({}));
const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
for (const [r] of __VLS_getVForSourceType((__VLS_ctx.store.history))) {
    /** @type {[typeof ListRow, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(ListRow, new ListRow({
        key: (r.name),
        title: (r.log_type === 'IN' ? __VLS_ctx.t('checkin.check_in') : __VLS_ctx.t('checkin.check_out')),
        subtitle: (r.custom_location_address || (r.custom_task ?? '')),
        trailing: (__VLS_ctx.fmt(r.time)),
        icon: (r.log_type === 'IN' ? '↑' : '↓'),
    }));
    const __VLS_11 = __VLS_10({
        key: (r.name),
        title: (r.log_type === 'IN' ? __VLS_ctx.t('checkin.check_in') : __VLS_ctx.t('checkin.check_out')),
        subtitle: (r.custom_location_address || (r.custom_task ?? '')),
        trailing: (__VLS_ctx.fmt(r.time)),
        icon: (r.log_type === 'IN' ? '↑' : '↓'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
}
if (!__VLS_ctx.store.history.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "hist__empty" },
    });
    (__VLS_ctx.t('checkin.empty_history'));
}
/** @type {[typeof BottomNav, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(BottomNav, new BottomNav({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
/** @type {__VLS_StyleScopedClasses['hist']} */ ;
/** @type {__VLS_StyleScopedClasses['hist__empty']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            TopAppBar: TopAppBar,
            SyncBar: SyncBar,
            ListRow: ListRow,
            BottomNav: BottomNav,
            t: t,
            router: router,
            store: store,
            fmt: fmt,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
