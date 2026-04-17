import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { getPhoto, savePhoto, removePhoto } from "@/offline/photos";
const props = defineProps();
const emit = defineEmits();
const thumbUrl = ref(null);
const busy = ref(false);
async function load(id) {
    if (thumbUrl.value)
        URL.revokeObjectURL(thumbUrl.value);
    thumbUrl.value = null;
    if (!id)
        return;
    const row = await getPhoto(id);
    if (!row) {
        // frappe-vue-pwa §4.7: auto-clear when blob is missing
        emit("update:modelValue", null);
        return;
    }
    thumbUrl.value = URL.createObjectURL(row.blob);
}
onMounted(() => load(props.modelValue));
watch(() => props.modelValue, load);
onBeforeUnmount(() => {
    if (thumbUrl.value)
        URL.revokeObjectURL(thumbUrl.value);
});
async function onPick(e) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file)
        return;
    busy.value = true;
    try {
        const id = await savePhoto(file, file.type || "image/jpeg");
        emit("update:modelValue", id);
    }
    finally {
        busy.value = false;
        input.value = "";
    }
}
async function onClear() {
    if (props.modelValue)
        await removePhoto(props.modelValue);
    emit("update:modelValue", null);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['photoslot']} */ ;
/** @type {__VLS_StyleScopedClasses['photoslot__remove']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "photoslot" },
    ...{ class: ([__VLS_ctx.modelValue ? 'photoslot--filled' : 'photoslot--empty', `photoslot--${__VLS_ctx.aspect ?? '3:4'}`]) },
});
if (!__VLS_ctx.modelValue) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "photoslot__picker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (__VLS_ctx.onPick) },
        type: "file",
        accept: "image/*",
        capture: "environment",
        hidden: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.label ?? "+ Add photo");
}
else {
    if (__VLS_ctx.thumbUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            src: (__VLS_ctx.thumbUrl),
            alt: "",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.onClear) },
        ...{ class: "photoslot__remove" },
        'aria-label': "Remove photo",
    });
}
/** @type {__VLS_StyleScopedClasses['photoslot']} */ ;
/** @type {__VLS_StyleScopedClasses['photoslot__picker']} */ ;
/** @type {__VLS_StyleScopedClasses['photoslot__remove']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            thumbUrl: thumbUrl,
            onPick: onPick,
            onClear: onClear,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
