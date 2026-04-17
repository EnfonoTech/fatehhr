import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
const props = defineProps();
const container = ref(null);
let map = null;
let marker = null;
onMounted(() => {
    if (!container.value)
        return;
    map = L.map(container.value, {
        zoomControl: false,
        dragging: !!props.interactive,
        scrollWheelZoom: !!props.interactive,
        doubleClickZoom: !!props.interactive,
        touchZoom: !!props.interactive,
        keyboard: !!props.interactive,
    }).setView([props.latitude ?? 24.7136, props.longitude ?? 46.6753], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
    }).addTo(map);
    if (props.latitude != null && props.longitude != null) {
        marker = L.marker([props.latitude, props.longitude]).addTo(map);
    }
});
watch(() => [props.latitude, props.longitude], ([lat, lng]) => {
    if (!map)
        return;
    if (lat != null && lng != null) {
        if (!marker)
            marker = L.marker([lat, lng]).addTo(map);
        else
            marker.setLatLng([lat, lng]);
        map.setView([lat, lng]);
    }
});
onBeforeUnmount(() => {
    map?.remove();
    map = null;
    marker = null;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "mapprev" },
    ...{ style: ({ height: __VLS_ctx.height ?? '180px' }) },
    ref: "container",
});
/** @type {typeof __VLS_ctx.container} */ ;
/** @type {__VLS_StyleScopedClasses['mapprev']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            container: container,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
