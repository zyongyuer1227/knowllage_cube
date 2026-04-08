import { computed, ref } from "vue";
import { marked } from "marked";
import govDocCssSource from "../../../../static/css/cn-gov-doc.css?raw";
import fangSongUrl from "../../../../static/fonts/FangSong.ttf?url";
import kaiTiUrl from "../../../../static/fonts/KaiTi.ttf?url";
import simHeiUrl from "../../../../static/fonts/SimHei.ttf?url";
import xiaoBiaoSongUrl from "../../../../static/fonts/FZXBSJW.TTF?url";
const props = defineProps();
const frame = ref(null);
const frameHeight = ref(0);
marked.setOptions({
    breaks: true,
    gfm: true
});
const fontCss = `
@font-face {
  font-family: "FangSong";
  src: url("${fangSongUrl}") format("truetype");
  font-display: swap;
}

@font-face {
  font-family: "KaiTi";
  src: url("${kaiTiUrl}") format("truetype");
  font-display: swap;
}

@font-face {
  font-family: "SimHei";
  src: url("${simHeiUrl}") format("truetype");
  font-display: swap;
}

@font-face {
  font-family: "FZXBSJW";
  src: url("${xiaoBiaoSongUrl}") format("truetype");
  font-display: swap;
}

@font-face {
  font-family: "FZXiaoBiaoSong-B05S";
  src: url("${xiaoBiaoSongUrl}") format("truetype");
  font-display: swap;
}
`;
const govDocCss = govDocCssSource.replace(/@import\s+url\((['"])\.\/font\.css\1\);?/gi, "");
function normalizeImageMarkup(html) {
    return html.replace(/<img\b([^>]*?)\swidth="(\d+(?:\.\d+)?%)"([^>]*?)>/gi, (_, before, width, after) => {
        const existingStyleMatch = `${before} ${after}`.match(/\sstyle="([^"]*)"/i);
        const existingStyle = existingStyleMatch?.[1]?.trim() ?? "";
        const mergedStyle = [existingStyle.replace(/;$/, ""), `width: ${width}`].filter(Boolean).join("; ");
        const withoutStyle = `${before} ${after}`.replace(/\sstyle="[^"]*"/gi, "");
        return `<img${withoutStyle} style="${mergedStyle}">`;
    });
}
function preprocessMarkdownSource(source) {
    return (source ?? "")
        .replace(/\r/g, "")
        .replace(/^(>\s+)(\([a-zA-Z0-9]+\)|（[一二三四五六七八九十]+）|[a-zA-Z0-9]+\.)/gm, "$2");
}
function normalizePreviewMarkup(html) {
    return html
        .replace(/<p><strong>([^<]+[：:])<\/strong>/g, '<p class="doc-meta"><strong>$1</strong>')
        .replace(/<blockquote>\s*<p>/g, '<blockquote class="doc-quote"><p class="doc-quote-line">')
        .replace(/<\/p>\s*<\/blockquote>/g, "</p></blockquote>");
}
function ensureGuestHtml(html) {
    if (!html.trim()) {
        return "";
    }
    return html
        .replace(/<html([^>]*)>/i, '<html$1 style="background:#eef1f4;overflow:hidden;">')
        .replace(/<body([^>]*)>/i, '<body$1 style="box-sizing:border-box;min-height:auto;padding:24px 32px 40px;overflow:visible;">');
}
const srcdoc = computed(() => {
    if ((props.persistedHtml ?? "").trim()) {
        return ensureGuestHtml(props.persistedHtml ?? "");
    }
    const rendered = normalizePreviewMarkup(normalizeImageMarkup(marked.parse(preprocessMarkdownSource(props.source ?? ""))));
    return `<!doctype html>
<html lang="zh-CN" style="background:#eef1f4;overflow:hidden;">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
${fontCss}
    </style>
    <style>
${govDocCss}
    </style>
    <style>
      body {
        box-sizing: border-box;
        min-height: auto;
        padding: 24px 32px 40px;
        overflow: visible;
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
function syncFrameHeight() {
    requestAnimationFrame(() => {
        const doc = frame.value?.contentDocument;
        const scrollRoot = doc?.scrollingElement;
        const body = doc?.body;
        const nextHeight = Math.max(scrollRoot?.scrollHeight ?? 0, scrollRoot?.offsetHeight ?? 0, body?.scrollHeight ?? 0, body?.offsetHeight ?? 0);
        frameHeight.value = Math.max(nextHeight, 1);
    });
}
function handleLoad() {
    syncFrameHeight();
}
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
    ...{ style: ({ height: `${__VLS_ctx.frameHeight}px` }) },
    srcdoc: (__VLS_ctx.srcdoc),
    title: "公文 HTML 预览",
    scrolling: "no",
});
/** @type {typeof __VLS_ctx.frame} */ ;
/** @type {__VLS_StyleScopedClasses['gov-doc-preview']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            frame: frame,
            frameHeight: frameHeight,
            srcdoc: srcdoc,
            handleLoad: handleLoad,
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
