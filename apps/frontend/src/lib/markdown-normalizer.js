function decodeHtmlEntities(input) {
    if (typeof document === "undefined") {
        return input;
    }
    const textarea = document.createElement("textarea");
    textarea.innerHTML = input;
    return textarea.value;
}
function isHtmlLike(input) {
    return /<\/?[a-z][\s\S]*>/i.test(input);
}
function normalizeInlineText(input) {
    return input
        .replace(/\u00a0/g, " ")
        .replace(/[  ]/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n");
}
function splitStructuredLine(input) {
    const trimmed = input.trim();
    const patterns = [
        /^(第[一二三四五六七八九十百千万]+条)(.+)$/,
        /^(第[一二三四五六七八九十百千万]+章)(.+)$/,
        /^([一二三四五六七八九十]+、)(.+)$/,
        /^(（[一二三四五六七八九十]+）)(.+)$/
    ];
    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
            return [match[1].trim(), match[2].trim()].filter(Boolean);
        }
    }
    return [trimmed];
}
function extractLinesFromHtml(input) {
    if (typeof DOMParser === "undefined") {
        return input;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, "text/html");
    const blocks = Array.from(doc.body.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, tr"));
    if (blocks.length === 0) {
        return doc.body.textContent ?? "";
    }
    return blocks
        .map((node) => normalizeInlineText(node.textContent ?? "").trim())
        .filter(Boolean)
        .join("\n\n");
}
function looksLikeMarkdown(line) {
    return /^(#{1,6}\s|\-\s|\*\s|\d+\.\s|>\s|```|\|.+\|$)/.test(line);
}
function isMainTitle(line, index) {
    if (index !== 0) {
        return false;
    }
    if (line.length > 40) {
        return false;
    }
    return !/^第[一二三四五六七八九十百千万]+[章节条]/.test(line);
}
function toMarkdownLine(line, index) {
    if (!line) {
        return "";
    }
    if (looksLikeMarkdown(line)) {
        return line;
    }
    if (isMainTitle(line, index)) {
        return `# ${line}`;
    }
    if (/^第[一二三四五六七八九十百千万]+章/.test(line)) {
        return `## ${line}`;
    }
    if (/^第[一二三四五六七八九十百千万]+条/.test(line)) {
        return `### ${line}`;
    }
    if (/^[一二三四五六七八九十]+、/.test(line)) {
        return `### ${line}`;
    }
    if (/^（[一二三四五六七八九十]+）/.test(line)) {
        return `#### ${line}`;
    }
    if (/^\d+\./.test(line)) {
        return `#### ${line}`;
    }
    return line;
}
export function normalizeToMarkdown(input) {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
        return "";
    }
    const normalizedSource = isHtmlLike(trimmedInput)
        ? extractLinesFromHtml(trimmedInput)
        : decodeHtmlEntities(trimmedInput);
    const normalizedText = normalizeInlineText(normalizedSource)
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
    const rawBlocks = normalizedText
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);
    const normalizedBlocks = rawBlocks.flatMap((block) => {
        const lines = block
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length === 0) {
            return [];
        }
        if (lines.length === 1) {
            return splitStructuredLine(lines[0]);
        }
        return lines.flatMap((line) => splitStructuredLine(line));
    });
    const markdownBlocks = normalizedBlocks.map((block, index) => toMarkdownLine(block, index));
    return markdownBlocks.join("\n\n").trim();
}
