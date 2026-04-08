<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  ensureGuestHtml,
  previewFontCss,
  previewGovDocCss,
  renderMarkdownPreviewFragment
} from "../lib/preview-render";

const props = defineProps<{
  source: string;
  persistedHtml?: string;
  highlightTerm?: string;
}>();

const frame = ref<HTMLIFrameElement | null>(null);
const frameHeight = ref(0);

const srcdoc = computed(() => {
  if ((props.persistedHtml ?? "").trim()) {
    return ensureGuestHtml(props.persistedHtml ?? "");
  }

  const rendered = renderMarkdownPreviewFragment(props.source ?? "");

  return `<!doctype html>
<html lang="zh-CN" style="background:#eef1f4;overflow:hidden;">
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
    const scrollRoot = doc?.scrollingElement as HTMLElement | null;
    const documentElement = doc?.documentElement as HTMLElement | null;
    const body = doc?.body;
    const nextHeight = Math.ceil(Math.max(
      scrollRoot?.scrollHeight ?? 0,
      body?.scrollHeight ?? 0,
      documentElement?.scrollHeight ?? 0,
      body?.getBoundingClientRect().height ?? 0,
      documentElement?.getBoundingClientRect().height ?? 0
    ));
    frameHeight.value = Math.max(nextHeight, 1);
  });
}

function normalizeSearchValue(value: string) {
  return (value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\.\.\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clearHighlights(doc: Document) {
  doc.querySelectorAll("mark.kc-search-hit").forEach((node) => {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(doc.createTextNode(node.textContent ?? ""), node);
    parent.normalize();
  });
}

function ensureHighlightStyle(doc: Document) {
  if (doc.getElementById("kc-search-highlight-style")) {
    return;
  }
  const style = doc.createElement("style");
  style.id = "kc-search-highlight-style";
  style.textContent = `
    mark.kc-search-hit {
      padding: 0 2px;
      border-radius: 2px;
      background: rgba(255, 213, 79, 0.78);
      color: inherit;
    }
  `;
  doc.head.appendChild(style);
}

function collectTextNodes(root: Node, nodes: Text[] = []) {
  root.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      if ((child.textContent ?? "").trim()) {
        nodes.push(child as Text);
      }
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = child as HTMLElement;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "MARK"].includes(element.tagName)) {
      return;
    }

    collectTextNodes(child, nodes);
  });
  return nodes;
}

function highlightTextNode(doc: Document, textNode: Text, keyword: string) {
  const source = textNode.textContent ?? "";
  const lowerSource = source.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  let cursor = 0;
  let hitCount = 0;
  const fragment = doc.createDocumentFragment();

  while (cursor < source.length) {
    const index = lowerSource.indexOf(lowerKeyword, cursor);
    if (index < 0) {
      break;
    }
    if (index > cursor) {
      fragment.appendChild(doc.createTextNode(source.slice(cursor, index)));
    }
    const mark = doc.createElement("mark");
    mark.className = "kc-search-hit";
    mark.textContent = source.slice(index, index + keyword.length);
    fragment.appendChild(mark);
    cursor = index + keyword.length;
    hitCount += 1;
  }

  if (hitCount === 0) {
    return 0;
  }

  if (cursor < source.length) {
    fragment.appendChild(doc.createTextNode(source.slice(cursor)));
  }

  textNode.parentNode?.replaceChild(fragment, textNode);
  return hitCount;
}

function applySearchHighlight() {
  const doc = frame.value?.contentDocument;
  if (!doc?.body) {
    return;
  }

  ensureHighlightStyle(doc);
  clearHighlights(doc);

  const keyword = normalizeSearchValue(props.highlightTerm ?? "");
  if (!keyword) {
    syncFrameHeight();
    return;
  }

  collectTextNodes(doc.body).forEach((node) => {
    highlightTextNode(doc, node, keyword);
  });
  syncFrameHeight();
}

function resetNativeFindSelection() {
  const frameWindow = frame.value?.contentWindow;
  const doc = frame.value?.contentDocument;
  if (!frameWindow || !doc) {
    return;
  }
  const selection = frameWindow.getSelection();
  selection?.removeAllRanges();
  if (!doc.body) {
    return;
  }
  const range = doc.createRange();
  range.setStart(doc.body, 0);
  range.collapse(true);
  selection?.addRange(range);
}

function findMatch(backwards = false) {
  const keyword = normalizeSearchValue(props.highlightTerm ?? "");
  const frameWindow = frame.value?.contentWindow as (Window & {
    find?: (
      text: string,
      caseSensitive?: boolean,
      backwards?: boolean,
      wrapAround?: boolean,
      wholeWord?: boolean,
      searchInFrames?: boolean,
      showDialog?: boolean
    ) => boolean;
  }) | null;
  if (!keyword || !frameWindow?.find) {
    return false;
  }
  return frameWindow.find(keyword, false, backwards, true, false, false, false);
}

function findNextMatch() {
  return findMatch(false);
}

function findPrevMatch() {
  return findMatch(true);
}

function handleLoad() {
  syncFrameHeight();
  requestAnimationFrame(() => {
    applySearchHighlight();
  });
  window.setTimeout(() => {
    syncFrameHeight();
  }, 80);
  window.setTimeout(() => {
    syncFrameHeight();
  }, 220);
}

watch(
  () => [props.source, props.persistedHtml, props.highlightTerm],
  async () => {
    await nextTick();
    resetNativeFindSelection();
    requestAnimationFrame(() => {
      applySearchHighlight();
    });
  }
);

defineExpose({
  findNextMatch,
  findPrevMatch
});
</script>

<template>
  <iframe
    ref="frame"
    class="gov-doc-preview"
    :style="{ height: `${frameHeight}px` }"
    :srcdoc="srcdoc"
    title="公文 HTML 预览"
    scrolling="no"
    @load="handleLoad"
  ></iframe>
</template>

<style scoped>
.gov-doc-preview {
  width: 100%;
  border: 0;
  border-radius: 0;
  background: #eef1f4;
}
</style>
