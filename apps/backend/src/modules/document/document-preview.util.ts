import { promises as fs } from "fs";
import { resolve } from "path";
import { marked } from "marked";
import {
  buildPreviewWatermarkPayload,
  readPreviewWatermarkSettings,
  type PreviewWatermarkRenderContext
} from "./preview-watermark.util";

type PreviewAssets = {
  fontCss: string;
  govDocCss: string;
};

const repoRoot = resolve(__dirname, "../../../../../");
const staticRoot = resolve(repoRoot, "static");

let cachedAssetsPromise: Promise<PreviewAssets> | null = null;

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

function preprocessMarkdownSource(source: string) {
  return (source ?? "")
    .replace(/\r/g, "")
    .replace(/^(>\s+)(\([a-zA-Z0-9]+\)|（[一二三四五六七八九十]+）|[a-zA-Z0-9]+\.)/gm, "$2");
}

function normalizePreviewMarkup(html: string) {
  return html
    .replace(/<p><strong>([^<]+[：:])<\/strong>/g, '<p class="doc-meta"><strong>$1</strong>')
    .replace(/<blockquote>\s*<p>/g, '<blockquote class="doc-quote"><p class="doc-quote-line">')
    .replace(/<\/p>\s*<\/blockquote>/g, "</p></blockquote>");
}

async function toDataUri(path: string) {
  const buffer = await fs.readFile(path);
  return `data:font/ttf;base64,${buffer.toString("base64")}`;
}

async function loadPreviewAssets(): Promise<PreviewAssets> {
  if (!cachedAssetsPromise) {
    cachedAssetsPromise = (async () => {
      const [govDocCssSource, fangSongUrl, kaiTiUrl, simHeiUrl, xiaoBiaoSongUrl] = await Promise.all([
        fs.readFile(resolve(staticRoot, "css", "cn-gov-doc.css"), "utf-8"),
        toDataUri(resolve(staticRoot, "fonts", "FangSong.ttf")),
        toDataUri(resolve(staticRoot, "fonts", "KaiTi.ttf")),
        toDataUri(resolve(staticRoot, "fonts", "SimHei.ttf")),
        toDataUri(resolve(staticRoot, "fonts", "FZXBSJW.TTF"))
      ]);

      return {
        fontCss: `
@font-face {
  font-family: "FangSong";
  src: url("${fangSongUrl}") format("truetype");
  font-display: block;
}

@font-face {
  font-family: "KaiTi";
  src: url("${kaiTiUrl}") format("truetype");
  font-display: block;
}

@font-face {
  font-family: "SimHei";
  src: url("${simHeiUrl}") format("truetype");
  font-display: block;
}

@font-face {
  font-family: "FZXBSJW";
  src: url("${xiaoBiaoSongUrl}") format("truetype");
  font-display: block;
}

@font-face {
  font-family: "FZXiaoBiaoSong-B05S";
  src: url("${xiaoBiaoSongUrl}") format("truetype");
  font-display: block;
}
`,
        govDocCss: govDocCssSource.replace(/@import\s+url\((['"])\.\/font\.css\1\);?/gi, "")
      };
    })();
  }

  return cachedAssetsPromise;
}

export async function renderPersistedPreviewHtml(
  source: string,
  context: PreviewWatermarkRenderContext = {
    scope: "view",
    profile: "screen",
    source: "system"
  }
) {
  const { fontCss, govDocCss } = await loadPreviewAssets();
  const profile = context.profile ?? (context.scope === "export" ? "export" : "screen");
  const watermarkSettings = await readPreviewWatermarkSettings();
  const watermark = buildPreviewWatermarkPayload(watermarkSettings, {
    timestamp: new Date().toISOString(),
    ...context
  });
  const rendered = normalizePreviewMarkup(normalizeImageMarkup(marked.parse(preprocessMarkdownSource(source ?? "")) as string));

  return `<!doctype html>
<html lang="zh-CN">
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
      html {
        background: ${profile === "screen" ? "#eef1f4" : "#e6eaef"};
      }

      body {
        box-sizing: border-box;
        min-height: ${profile === "screen" ? "100vh" : "auto"};
        padding: ${profile === "screen" ? "24px 32px 40px" : profile === "print-preview" ? "18px 0 24px" : "0"};
        background: #ffffff;
        ${profile === "print-preview" ? "box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);" : ""}
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
${watermark.style}
    </style>
  </head>
  <body>
${watermark.htmlOverlay}
${rendered}
  </body>
</html>`;
}
