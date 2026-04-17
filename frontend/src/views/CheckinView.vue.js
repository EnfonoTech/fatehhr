import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import AppButton from "@/components/Button.vue";
import SyncBar from "@/components/SyncBar.vue";
import MapPreview from "@/components/MapPreview.vue";
import PhotoSlot from "@/components/PhotoSlot.vue";
import BottomNav from "@/components/BottomNav.vue";
import { useCheckinStore } from "@/stores/checkin";
import { getCurrentCoords, hapticMedium, hapticError } from "@/app/frappe";
import { utilApi } from "@/api/util";
import { classify } from "@/offline/geofence-shim";
import { CUSTOMER_SELFIE_MODE } from "virtual:fatehhr-theme";
const { t } = useI18n();
const store = useCheckinStore();
const router = useRouter();
const lat = ref(null);
const lng = ref(null);
const address = ref(null);
const task = ref(null);
const selfiePhotoId = ref(null);
const busy = ref(false);
const message = ref(null);
const geofence = ref("unknown");
onMounted(async () => {
    await store.refreshToday();
    const coords = await getCurrentCoords();
    if (coords) {
        lat.value = coords.latitude;
        lng.value = coords.longitude;
        try {
            const g = await utilApi.reverseGeocode(coords.latitude, coords.longitude);
            address.value = g.address;
        }
        catch {
            /* offline */
        }
    }
    geofence.value = classify(null, null, null, lat.value, lng.value);
});
const needsSelfie = computed(() => {
    if (CUSTOMER_SELFIE_MODE === "every")
        return true;
    if (CUSTOMER_SELFIE_MODE === "first")
        return store.currentStatus !== "IN";
    return false;
});
const nextLogType = computed(() => store.currentStatus === "IN" ? "OUT" : "IN");
async function submit() {
    if (needsSelfie.value && !selfiePhotoId.value) {
        await hapticError();
        message.value = t("checkin.selfie_required");
        return;
    }
    busy.value = true;
    message.value = null;
    try {
        const res = await store.submit({
            log_type: nextLogType.value,
            latitude: lat.value,
            longitude: lng.value,
            address: address.value,
            task: task.value,
            selfie_photo_id: selfiePhotoId.value,
        });
        await hapticMedium();
        message.value = res.mode === "online" ? t("checkin.done") : t("checkin.queued");
        if (res.mode === "online" && res.row) {
            geofence.value = res.row.custom_geofence_status;
        }
        selfiePhotoId.value = null;
    }
    finally {
        busy.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['checkin__geofence']} */ ;
/** @type {__VLS_StyleScopedClasses['checkin__geofence']} */ ;
/** @type {__VLS_StyleScopedClasses['checkin__geofence']} */ ;
/** @type {__VLS_StyleScopedClasses['checkin__geofence']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "checkin" },
});
/** @type {[typeof TopAppBar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(TopAppBar, new TopAppBar({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.t('checkin.title')),
    back: true,
}));
const __VLS_1 = __VLS_0({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.t('checkin.title')),
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
/** @type {[typeof MapPreview, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(MapPreview, new MapPreview({
    latitude: (__VLS_ctx.lat),
    longitude: (__VLS_ctx.lng),
    height: "200px",
}));
const __VLS_11 = __VLS_10({
    latitude: (__VLS_ctx.lat),
    longitude: (__VLS_ctx.lng),
    height: "200px",
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "checkin__address" },
});
(__VLS_ctx.address ?? __VLS_ctx.t('checkin.unknown_location'));
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "checkin__geofence" },
    ...{ class: (`is-${__VLS_ctx.geofence}`) },
});
(__VLS_ctx.t(`checkin.geofence.${__VLS_ctx.geofence}`));
if (__VLS_ctx.needsSelfie) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "checkin__selfie" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    (__VLS_ctx.t('checkin.selfie'));
    /** @type {[typeof PhotoSlot, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(PhotoSlot, new PhotoSlot({
        modelValue: (__VLS_ctx.selfiePhotoId),
        aspect: "3:4",
    }));
    const __VLS_14 = __VLS_13({
        modelValue: (__VLS_ctx.selfiePhotoId),
        aspect: "3:4",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
}
/** @type {[typeof AppButton, typeof AppButton, ]} */ ;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent(AppButton, new AppButton({
    ...{ 'onClick': {} },
    block: true,
    disabled: (__VLS_ctx.busy),
}));
const __VLS_17 = __VLS_16({
    ...{ 'onClick': {} },
    block: true,
    disabled: (__VLS_ctx.busy),
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
let __VLS_19;
let __VLS_20;
let __VLS_21;
const __VLS_22 = {
    onClick: (__VLS_ctx.submit)
};
__VLS_18.slots.default;
(__VLS_ctx.nextLogType === 'IN' ? __VLS_ctx.t('checkin.check_in') : __VLS_ctx.t('checkin.check_out'));
var __VLS_18;
if (__VLS_ctx.message) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "checkin__msg" },
    });
    (__VLS_ctx.message);
}
const __VLS_23 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.RouterLink, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    to: "/checkin/history",
    ...{ class: "checkin__history-link" },
}));
const __VLS_25 = __VLS_24({
    to: "/checkin/history",
    ...{ class: "checkin__history-link" },
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_26.slots.default;
(__VLS_ctx.t('checkin.history'));
var __VLS_26;
/** @type {[typeof BottomNav, ]} */ ;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent(BottomNav, new BottomNav({}));
const __VLS_28 = __VLS_27({}, ...__VLS_functionalComponentArgsRest(__VLS_27));
/** @type {__VLS_StyleScopedClasses['checkin']} */ ;
/** @type {__VLS_StyleScopedClasses['checkin__address']} */ ;
/** @type {__VLS_StyleScopedClasses['checkin__geofence']} */ ;
/** @type {__VLS_StyleScopedClasses['checkin__selfie']} */ ;
/** @type {__VLS_StyleScopedClasses['checkin__msg']} */ ;
/** @type {__VLS_StyleScopedClasses['checkin__history-link']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            TopAppBar: TopAppBar,
            AppButton: AppButton,
            SyncBar: SyncBar,
            MapPreview: MapPreview,
            PhotoSlot: PhotoSlot,
            BottomNav: BottomNav,
            t: t,
            router: router,
            lat: lat,
            lng: lng,
            address: address,
            selfiePhotoId: selfiePhotoId,
            busy: busy,
            message: message,
            geofence: geofence,
            needsSelfie: needsSelfie,
            nextLogType: nextLogType,
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
