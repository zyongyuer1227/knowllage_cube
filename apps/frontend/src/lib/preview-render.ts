import { marked } from "marked";
import govDocCssSource from "../../../../static/css/cn-gov-doc.css?raw";
import fangSongUrl from "../../../../static/fonts/FangSong.ttf?url";
import kaiTiUrl from "../../../../static/fonts/KaiTi.ttf?url";
import simHeiUrl from "../../../../static/fonts/SimHei.ttf?url";
import xiaoBiaoSongUrl from "../../../../static/fonts/FZXBSJW.TTF?url";

marked.setOptions({
  breaks: true,
  gfm: true
});

export const previewFontCss = `
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

export const previewGovDocCss = govDocCssSource.replace(/@import\s+url\((['"])\.\/font\.css\1\);?/gi, "");

export function normalizeImageMarkup(html: string) {
  return html.replace(/<img\b([^>]*?)\swidth="(\d+(?:\.\d+)?%)"([^>]*?)>/gi, (_, before, width, after) => {
    const existingStyleMatch = `${before} ${after}`.match(/\sstyle="([^"]*)"/i);
    const existingStyle = existingStyleMatch?.[1]?.trim() ?? "";
    const mergedStyle = [existingStyle.replace(/;$/, ""), `width: ${width}`].filter(Boolean).join("; ");
    const withoutStyle = `${before} ${after}`.replace(/\sstyle="[^"]*"/gi, "");
    return `<img${withoutStyle} style="${mergedStyle}">`;
  });
}

export function preprocessMarkdownSource(source: string) {
  return (source ?? "")
    .replace(/\r/g, "")
    .replace(/^(>\s+)(\([a-zA-Z0-9]+\)|（[一二三四五六七八九十]+）|[a-zA-Z0-9]+\.)/gm, "$2");
}

export function normalizePreviewMarkup(html: string) {
  return html
    .replace(/<p><strong>([^<]+[：:])<\/strong>/g, '<p class="doc-meta"><strong>$1</strong>')
    .replace(/<blockquote>\s*<p>/g, '<blockquote class="doc-quote"><p class="doc-quote-line">')
    .replace(/<\/p>\s*<\/blockquote>/g, "</p></blockquote>");
}

export function renderMarkdownPreviewFragment(source: string) {
  return normalizePreviewMarkup(
    normalizeImageMarkup(marked.parse(preprocessMarkdownSource(source ?? "")) as string)
  );
}

export function ensureGuestHtml(html: string) {
  if (!html.trim()) {
    return "";
  }
  return html
    .replace(/<html([^>]*)>/i, '<html$1 style="background:#eef1f4;overflow:hidden;">')
    .replace(/<body([^>]*)>/i, '<body$1 style="box-sizing:border-box;min-height:auto;padding:24px 32px 40px;overflow:visible;">');
}
