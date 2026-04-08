import { computed, ref } from "vue";
import { previewFontCss, previewGovDocCss, renderMarkdownPreviewFragment } from "../lib/preview-render";
const props = defineProps();
const emit = defineEmits();
const frame = ref(null);
let frameScrollTicking = false;
let pendingScrollRatio = 0;
const srcdoc = computed(() => {
    if (!(props.source ?? "").trim() && (props.persistedHtml ?? "").trim()) {
        return props.persistedHtml ?? "";
    }
    const rendered = renderMarkdownPreviewFragment(props.source ?? "");
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
${previewFontCss}
    </style>
    <style>
${previewGovDocCss}
    </style>
    <style>
      html {
        background: #eef1f4;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(109, 123, 145, 0.72) rgba(198, 206, 218, 0.35);
      }

      body {
        box-sizing: border-box;
        min-height: auto;
        padding: 24px 32px 40px;
        overflow: visible;
      }

      html::-webkit-scrollbar {
        width: 10px;
      }

      html::-webkit-scrollbar-track {
        background: rgba(198, 206, 218, 0.35);
        border-radius: 999px;
      }

      html::-webkit-scrollbar-thumb {
        background: rgba(109, 123, 145, 0.72);
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: padding-box;
      }

      html::-webkit-scrollbar-thumb:hover {
        background: rgba(86, 100, 123, 0.88);
        background-clip: padding-box;
      }

      img {
        max-width: 100%;
        height: auto;
      }

      p.doc-meta,
      blockquote.doc-quote,
      blockquote.doc-quote p.doc-quote-line {
        text-indent: 0;
      }

      p.doc-meta {
        margin: 0;
      }

      blockquote.doc-quote {
        margin: 0;
        padding: 0;
        border: 0;
      }
    </style>
  </head>
  <body>
${rendered}
  </body>
</html>`;
});
function getFrameScrollRoot() {
    return frame.value?.contentDocument?.scrollingElement;
}
function getScrollRatio() {
    const scrollRoot = getFrameScrollRoot();
    if (!scrollRoot)
        return 0;
    const maxScrollTop = scrollRoot.scrollHeight - scrollRoot.clientHeight;
    if (maxScrollTop <= 0)
        return 0;
    return scrollRoot.scrollTop / maxScrollTop;
}
function setScrollRatio(value) {
    pendingScrollRatio = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    const scrollRoot = getFrameScrollRoot();
    if (!scrollRoot)
        return;
    const maxScrollTop = scrollRoot.scrollHeight - scrollRoot.clientHeight;
    scrollRoot.scrollTop = maxScrollTop > 0 ? maxScrollTop * pendingScrollRatio : 0;
}
function handleFrameScroll() {
    if (frameScrollTicking)
        return;
    frameScrollTicking = true;
    requestAnimationFrame(() => {
        frameScrollTicking = false;
        emit("scroll-ratio", getScrollRatio());
    });
}
function handleLoad() {
    const frameWindow = frame.value?.contentWindow;
    frameWindow?.removeEventListener("scroll", handleFrameScroll);
    frameWindow?.addEventListener("scroll", handleFrameScroll, { passive: true });
    setScrollRatio(pendingScrollRatio);
}
const __VLS_exposed = {
    setScrollRatio
};
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.iframe, __VLS_intrinsicElements.iframe)({
    ...{ onLoad: (__VLS_ctx.handleLoad) },
    ref: "frame",
    ...{ class: "gov-doc-preview" },
    srcdoc: (__VLS_ctx.srcdoc),
    title: "公文 HTML 预览",
    scrolling: "auto",
});
/** @type {typeof __VLS_ctx.frame} */ ;
/** @type {__VLS_StyleScopedClasses['gov-doc-preview']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            frame: frame,
            srcdoc: srcdoc,
            handleLoad: handleLoad,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
