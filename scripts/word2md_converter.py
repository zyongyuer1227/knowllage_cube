#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Word -> Markdown-like TXT converter backed by DeepSeek.

Implements the webpage request:
"请按照sample.md的格式将test2.docx改写为带有md原格式的txt文档"
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from docx import Document
from openai import OpenAI

SCRIPT_DIR = Path(__file__).resolve().parent


SYSTEM_PROMPT = (
    "你是一个专业的文档格式转换助手，擅长将 Word 文档改写为严格遵循示例格式的 Markdown 文本。"
)


def build_user_prompt(sample_format: str, doc_content: str) -> str:
    return f"""请按照 sample.md 的格式将 Word 文档改写为带有 md 原格式的 txt 文档。

【示例格式 sample.md】
{sample_format}

【待转换的 Word 文档内容】
{doc_content}

输出要求：
1. 严格模仿 sample.md 的排版风格和层级结构。
2. 使用 Markdown 标题标记表示章节层级，例如 #、##、###、####。
3. 法条编号或条款标题使用粗体标记，例如 **第一条**。
4. 需要缩进的正文使用 &nbsp; 标记保留缩进表现。
5. 合适的位置使用 --- 作为分隔线。
6. 保留原文语义，不要额外总结、解释、点评或补充。
7. 只输出最终 txt 文件应写入的正文内容，不要输出前后说明。"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Use DeepSeek to rewrite a DOCX file into TXT with Markdown formatting."
    )
    parser.add_argument(
        "--sample",
        default="sample.md",
        help="Path to the sample Markdown file. Default: sample.md",
    )
    parser.add_argument(
        "--input",
        default="test2.docx",
        help="Path to the source Word document. Default: test2.docx",
    )
    parser.add_argument(
        "--output",
        default="test2_converted.txt",
        help="Path to the generated TXT file. Default: test2_converted.txt",
    )
    parser.add_argument(
        "--api-key",
        help="DeepSeek API key. If omitted, DEEPSEEK_API_KEY is used.",
    )
    parser.add_argument(
        "--base-url",
        default="https://api.deepseek.com",
        help="DeepSeek-compatible API base URL. Default: https://api.deepseek.com",
    )
    parser.add_argument(
        "--model",
        default="deepseek-chat",
        help="Model name. Default: deepseek-chat",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=8000,
        help="Maximum completion tokens. Default: 8000",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.3,
        help="Sampling temperature. Default: 0.3",
    )
    return parser.parse_args()


def resolve_cli_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (SCRIPT_DIR / path).resolve()


def read_text_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception as exc:
        raise RuntimeError(f"读取文本文件失败: {path} ({exc})") from exc


def read_docx(path: Path) -> str:
    try:
        doc = Document(path)
    except Exception as exc:
        raise RuntimeError(f"读取 Word 文档失败: {path} ({exc})") from exc

    blocks: list[str] = []
    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        if text:
            blocks.append(text)

    if not blocks:
        raise RuntimeError(f"Word 文档没有可用正文内容: {path}")

    return "\n\n".join(blocks)


def convert_with_deepseek(
    *,
    api_key: str,
    base_url: str,
    model: str,
    sample_format: str,
    doc_content: str,
    max_tokens: int,
    temperature: float,
) -> str:
    try:
        client = OpenAI(api_key=api_key, base_url=base_url)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": build_user_prompt(sample_format, doc_content),
                },
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        raise RuntimeError(f"调用 DeepSeek API 失败: {exc}") from exc

    if not response.choices:
        raise RuntimeError("DeepSeek API 未返回 choices")

    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("DeepSeek API 未返回可用内容")
    return content.strip() + "\n"


def save_output(path: Path, content: str) -> None:
    try:
        path.write_text(content, encoding="utf-8")
    except Exception as exc:
        raise RuntimeError(f"保存输出文件失败: {path} ({exc})") from exc


def main() -> int:
    args = parse_args()

    sample_path = resolve_cli_path(args.sample)
    input_path = resolve_cli_path(args.input)
    output_path = resolve_cli_path(args.output)
    api_key = args.api_key or os.environ.get("DEEPSEEK_API_KEY")

    if not api_key:
        print("缺少 DeepSeek API Key。请使用 --api-key 或设置 DEEPSEEK_API_KEY。", file=sys.stderr)
        return 1

    if not sample_path.exists():
        print(f"找不到示例文件: {sample_path}", file=sys.stderr)
        return 1

    if not input_path.exists():
        print(f"找不到 Word 文档: {input_path}", file=sys.stderr)
        return 1

    try:
        print(f"[1/4] 读取示例格式: {sample_path}")
        sample_format = read_text_file(sample_path)
        print(f"[2/4] 读取 Word 文档: {input_path}")
        doc_content = read_docx(input_path)
        print(f"[3/4] 调用 DeepSeek 模型: {args.model}")
        converted = convert_with_deepseek(
            api_key=api_key,
            base_url=args.base_url,
            model=args.model,
            sample_format=sample_format,
            doc_content=doc_content,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
        )
        print(f"[4/4] 写入 TXT 文件: {output_path}")
        save_output(output_path, converted)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(f"转换完成: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
