import { promises as fs } from "fs";
import { resolve } from "path";

export type PreviewWatermarkMode = "view" | "export" | "both";

export type PreviewWatermarkSettings = {
  enabled: boolean;
  mode: PreviewWatermarkMode;
  text: string;
  color: string;
  fontSize: number;
  opacity: number;
  rotate: number;
  gapX: number;
  gapY: number;
};

export type WatermarkDocumentMeta = {
  id?: string | null;
  title?: string | null;
  archivePath?: string | null;
};

export type PreviewWatermarkRenderContext = {
  scope: "view" | "export";
  profile?: "screen" | "print-preview" | "export";
  source: "admin" | "public" | "system";
  username?: string | null;
  role?: string | null;
  ip?: string | null;
  timestamp?: string;
  document?: WatermarkDocumentMeta | null;
};

export type ResolvedWatermarkPayload = {
  enabled: boolean;
  mode: PreviewWatermarkMode;
  text: string;
  svg: string | null;
  dataUri: string | null;
  style: string;
  htmlOverlay: string;
};

const previewSettingsPath = resolve(process.cwd(), "storage", "system", "preview-watermark.json");

export const DEFAULT_PREVIEW_WATERMARK_SETTINGS: PreviewWatermarkSettings = {
  enabled: true,
  mode: "both",
  text: "{{username}} {{timestamp}}\n{{documentTitle}}",
  color: "#8b949e",
  fontSize: 16,
  opacity: 0.16,
  rotate: -20,
  gapX: 240,
  gapY: 170
};

export const MANDATORY_EXPORT_WATERMARK_TEMPLATE = "{{username}} {{timestamp}}\n{{documentId}} {{ip}}";

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, normalized));
}

function normalizeColor(value: unknown) {
  const color = String(value ?? "").trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : DEFAULT_PREVIEW_WATERMARK_SETTINGS.color;
}

function normalizeMode(value: unknown): PreviewWatermarkMode {
  return value === "view" || value === "export" || value === "both" ? value : DEFAULT_PREVIEW_WATERMARK_SETTINGS.mode;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatTimestamp(iso: string) {
  const normalized = new Date(iso);
  if (Number.isNaN(normalized.getTime())) {
    return iso;
  }
  const parts = [
    normalized.getFullYear(),
    String(normalized.getMonth() + 1).padStart(2, "0"),
    String(normalized.getDate()).padStart(2, "0")
  ];
  const timeParts = [
    String(normalized.getHours()).padStart(2, "0"),
    String(normalized.getMinutes()).padStart(2, "0"),
    String(normalized.getSeconds()).padStart(2, "0")
  ];
  return `${parts.join("-")} ${timeParts.join(":")}`;
}

function normalizeTemplateValue(value: string | null | undefined, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function normalizePreviewWatermarkSettings(
  input: Partial<PreviewWatermarkSettings> | null | undefined
): PreviewWatermarkSettings {
  return {
    enabled: typeof input?.enabled === "boolean" ? input.enabled : DEFAULT_PREVIEW_WATERMARK_SETTINGS.enabled,
    mode: normalizeMode(input?.mode),
    text: String(input?.text ?? "").trim() || DEFAULT_PREVIEW_WATERMARK_SETTINGS.text,
    color: normalizeColor(input?.color),
    fontSize: clampNumber(input?.fontSize, 12, 36, DEFAULT_PREVIEW_WATERMARK_SETTINGS.fontSize),
    opacity: clampNumber(input?.opacity, 0.05, 0.4, DEFAULT_PREVIEW_WATERMARK_SETTINGS.opacity),
    rotate: clampNumber(input?.rotate, -45, 45, DEFAULT_PREVIEW_WATERMARK_SETTINGS.rotate),
    gapX: clampNumber(input?.gapX, 120, 360, DEFAULT_PREVIEW_WATERMARK_SETTINGS.gapX),
    gapY: clampNumber(input?.gapY, 100, 300, DEFAULT_PREVIEW_WATERMARK_SETTINGS.gapY)
  };
}

export async function readPreviewWatermarkSettings() {
  try {
    const raw = await fs.readFile(previewSettingsPath, "utf-8");
    return normalizePreviewWatermarkSettings(JSON.parse(raw) as Partial<PreviewWatermarkSettings>);
  } catch {
    return { ...DEFAULT_PREVIEW_WATERMARK_SETTINGS };
  }
}

export function buildPreviewWatermarkTemplateContext(context: PreviewWatermarkRenderContext) {
  const timestamp = context.timestamp ?? new Date().toISOString();
  const formattedTimestamp = formatTimestamp(timestamp);
  const document = context.document ?? null;

  return {
    username: normalizeTemplateValue(context.username, context.source === "public" ? "访客访问" : "管理员"),
    role: normalizeTemplateValue(context.role, context.source),
    ip: normalizeTemplateValue(context.ip, "unknown-ip"),
    timestamp: formattedTimestamp,
    isoTimestamp: timestamp,
    source: context.source,
    scope: context.scope,
    documentId: normalizeTemplateValue(document?.id, "unknown-doc"),
    documentTitle: normalizeTemplateValue(document?.title, "未命名文档"),
    archivePath: normalizeTemplateValue(document?.archivePath, "未归档")
  };
}

export function resolvePreviewWatermarkText(
  template: string,
  context: PreviewWatermarkRenderContext
) {
  const values = buildPreviewWatermarkTemplateContext(context);
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return values[key as keyof typeof values] ?? "";
  });
}

function getEffectiveWatermarkTemplate(settings: PreviewWatermarkSettings, context: PreviewWatermarkRenderContext) {
  if (context.scope !== "export") {
    return settings.text;
  }

  const base = MANDATORY_EXPORT_WATERMARK_TEMPLATE.trim();
  const custom = settings.text.trim();
  if (!custom) {
    return base;
  }
  return custom === base ? base : `${base}\n${custom}`;
}

function shouldRenderForScope(settings: PreviewWatermarkSettings, scope: PreviewWatermarkRenderContext["scope"]) {
  return settings.mode === "both" || settings.mode === scope;
}

export function buildPreviewWatermarkSvg(
  settings: PreviewWatermarkSettings,
  context: PreviewWatermarkRenderContext
) {
  if (!settings.enabled || !shouldRenderForScope(settings, context.scope)) {
    return null;
  }

  const resolvedText = resolvePreviewWatermarkText(getEffectiveWatermarkTemplate(settings, context), context)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (resolvedText.length === 0) {
    return null;
  }

  const centerX = settings.gapX / 2;
  const centerY = settings.gapY / 2;
  const lineHeight = Math.round(settings.fontSize * 1.5);
  const firstLineY = centerY - ((resolvedText.length - 1) * lineHeight) / 2;
  const tspanMarkup = resolvedText
    .map((line, index) => {
      const y = firstLineY + index * lineHeight;
      return `<tspan x="${centerX}" y="${y}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${settings.gapX}" height="${settings.gapY}" viewBox="0 0 ${settings.gapX} ${settings.gapY}">
  <text
    text-anchor="middle"
    fill="${settings.color}"
    fill-opacity="${settings.opacity}"
    font-size="${settings.fontSize}"
    font-family="FangSong, serif"
    transform="rotate(${settings.rotate} ${centerX} ${centerY})"
  >${tspanMarkup}</text>
</svg>`;
}

export function buildPreviewWatermarkPayload(
  settings: PreviewWatermarkSettings,
  context: PreviewWatermarkRenderContext
): ResolvedWatermarkPayload {
  const text = resolvePreviewWatermarkText(getEffectiveWatermarkTemplate(settings, context), context);
  const svg = buildPreviewWatermarkSvg(settings, context);
  const dataUri = svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : null;
  const useBackgroundLayer = Boolean(svg) && context.scope === "view";
  const useHtmlOverlay = Boolean(svg) && context.scope === "export";
  const lines = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const tileText = lines.map((line) => `<span>${escapeXml(line)}</span>`).join("");
  const tileCount = 48;
  const style = svg
    ? `
${useBackgroundLayer ? `
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 999;
        background-image: url("${dataUri}");
        background-repeat: repeat;
        background-size: ${settings.gapX}px ${settings.gapY}px;
      }
` : ""}
${useHtmlOverlay ? `
      .preview-watermark-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 999;
        display: grid;
        grid-template-columns: repeat(6, ${settings.gapX}px);
        grid-auto-rows: ${settings.gapY}px;
        justify-content: center;
        align-content: start;
        overflow: hidden;
      }

      .preview-watermark-layer.strong {
        grid-template-columns: repeat(6, ${settings.gapX}px);
      }

      .preview-watermark-tile {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: ${Math.max(4, Math.round(settings.fontSize * 0.28))}px;
        color: ${settings.color};
        opacity: ${context.scope === "export" ? Math.max(settings.opacity, 0.24) : settings.opacity};
        font-family: "FangSong", serif;
        font-size: ${context.scope === "export" ? settings.fontSize + 1 : settings.fontSize}px;
        line-height: 1.35;
        text-align: center;
        white-space: pre-wrap;
        transform: rotate(${settings.rotate}deg);
        transform-origin: center;
        text-rendering: geometricPrecision;
        -webkit-font-smoothing: antialiased;
      }

      .preview-watermark-tile span {
        display: block;
      }
` : ""}
`
    : "";
  const htmlOverlay = useHtmlOverlay
    ? `<div class="preview-watermark-layer${context.scope === "export" ? " strong" : ""}" aria-hidden="true">${Array.from({
        length: tileCount
      })
        .map(() => `<div class="preview-watermark-tile">${tileText}</div>`)
        .join("")}</div>`
    : "";

  return {
    enabled: Boolean(svg),
    mode: settings.mode,
    text,
    svg,
    dataUri,
    style,
    htmlOverlay
  };
}
