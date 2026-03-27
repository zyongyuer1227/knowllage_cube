import { computed } from "vue";
const props = defineProps();
const classes = computed(() => {
    const values = ["fa-solid", `fa-${props.name}`];
    if (props.fixedWidth) {
        values.push("fa-fw");
    }
    return values;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
    ...{ class: (__VLS_ctx.classes) },
    'aria-hidden': "true",
});
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            classes: classes,
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
