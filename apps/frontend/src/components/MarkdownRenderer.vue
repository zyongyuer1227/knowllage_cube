<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";

const props = defineProps<{
  source: string;
}>();

marked.setOptions({
  breaks: true,
  gfm: true
});

function normalizeImageMarkup(html: string) {
  return html.replace(/<img\b([^>]*?)\swidth="(\d+(?:\.\d+)?%)"([^>]*?)>/gi, (_, before, width, after) => {
    const existingStyleMatch = `${before} ${after}`.match(/\sstyle="([^"]*)"/i);
    const existingStyle = existingStyleMatch?.[1]?.trim() ?? "";
    const mergedStyle = [existingStyle.replace(/;$/, ""), `width: ${width}`].filter(Boolean).join("; ");
    const withoutStyle = `${before} ${after}`.replace(/\sstyle="[^"]*"/gi, "");
    return `<img${withoutStyle} style="${mergedStyle}">`;
  });
}

const rendered = computed(() => normalizeImageMarkup(marked.parse(props.source ?? "") as string));
</script>

<template>
  <div class="markdown-body" v-html="rendered"></div>
</template>

<style scoped>
.markdown-body {
  color: var(--text-primary);
  line-height: 1.82;
  font-size: 15px;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 0 0 16px;
  line-height: 1.35;
  letter-spacing: -0.01em;
}

.markdown-body :deep(h1) {
  font-size: 32px;
  font-weight: 700;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
}

.markdown-body :deep(h2) {
  margin-top: 32px;
  font-size: 24px;
  font-weight: 700;
}

.markdown-body :deep(h3) {
  margin-top: 24px;
  font-size: 19px;
  font-weight: 700;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote),
.markdown-body :deep(table) {
  margin: 0 0 16px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 24px;
}

.markdown-body :deep(li + li) {
  margin-top: 8px;
}

.markdown-body :deep(a) {
  color: var(--file-icon-text);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--border-color);
  padding: 6px 0 6px 16px;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--button-bg) 55%, transparent);
  border-radius: 0 8px 8px 0;
}

.markdown-body :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border-color);
  margin: 24px 0;
}

.markdown-body :deep(code) {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--button-bg);
  font-size: 13px;
}

.markdown-body :deep(pre) {
  margin: 0 0 16px;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--button-bg);
  border: 1px solid var(--border-color);
  overflow: auto;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
  font-size: 13px;
  line-height: 1.7;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.markdown-body :deep(th) {
  background: var(--button-bg);
  font-weight: 600;
}

.markdown-body :deep(strong) {
  font-weight: 700;
}

.markdown-body :deep(em) {
  font-style: italic;
}

.markdown-body :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 16px 0;
  border-radius: 10px;
}
</style>
