#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from openai import OpenAI

SCRIPT_DIR = Path(__file__).resolve().parent

SYSTEM_PROMPT = (
    "你是一个专业的 Markdown 文档整理助手，擅长把用户粘贴的原始文本整理成结构清晰、格式规范的 Markdown 文本。"
)


def build_user_prompt(sample_format: str, text_content: str) -> str:
    return f"""请按照 sample.md 的风格，把下面原始文本整理为适合知识库录入的 Markdown 文本。

【示例格式 sample.md】
{sample_format}

【待整理文本】
{text_content}

输出要求：
1. 严格参考 sample.md 的层级结构和排版风格。
2. 根据内容自动补充合理的 Markdown 标题层级，例如 #、##、###、####。
3. 保留原始信息，不要编造事实，不要删减关键内容。
4. 只做结构化整理、断句、分段、标题归纳和必要的列表化处理。
5. 需要缩进的正文可以使用 &nbsp; 保留视觉缩进。
6. 只输出最终 txt 文件应写入的正文内容，不要输出解释、提示或前后说明。"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Use LLM to rewrite plain text into Markdown-like TXT.")
    parser.add_argument("--sample", default="sample.md")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--api-key")
    parser.add_argument("--base-url", default="https://api.deepseek.com")
    parser.add_argument("--model", default="deepseek-chat")
    parser.add_argument("--max-tokens", type=int, default=8000)
    parser.add_argument("--temperature", type=float, default=0.3)
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


def convert_with_model(
    *,
    api_key: str,
    base_url: str,
    model: str,
    sample_format: str,
    text_content: str,
    max_tokens: int,
    temperature: float,
) -> str:
    try:
        client = OpenAI(api_key=api_key, base_url=base_url)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_prompt(sample_format, text_content)},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        raise RuntimeError(f"调用模型失败: {exc}") from exc

    if not response.choices:
        raise RuntimeError("模型未返回 choices")

    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("模型未返回可用内容")
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
        print(f"找不到输入文本文件: {input_path}", file=sys.stderr)
        return 1

    try:
        sample_format = read_text_file(sample_path)
        text_content = read_text_file(input_path)
        if not text_content.strip():
            raise RuntimeError("输入文本为空")
        converted = convert_with_model(
            api_key=api_key,
            base_url=args.base_url,
            model=args.model,
            sample_format=sample_format,
            text_content=text_content,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
        )
        save_output(output_path, converted)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(f"转换完成: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
