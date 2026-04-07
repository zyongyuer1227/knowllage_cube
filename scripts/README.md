# scripts

根目录 `scripts/` 用于文档导入过程中的 Python 转换脚本与格式模板。当前运行代码实际依赖的文件只有 3 个：

- `sample.md`：Markdown 排版模板，两个 Python 脚本都会读取它作为风格参考。
- `text2md_formatter.py`：把原始纯文本整理为 Markdown 风格文本。
- `word2md_converter.py`：把 `.docx` 内容抽取后交给大模型改写成 Markdown 风格文本。

已清理的冗余文件：

- `test2.docx`
- `test2_converted.txt`
- `任意名称验证_道路运输办法.docx`

这些文件没有被根目录 `package.json`、后端源码或前端源码引用，属于样例或一次性测试产物，不应继续保留在仓库根目录脚本目录中。

## 运行关系

后端实际调用位置在 [document.service.ts](/F:/Cursor_PRO/knowllage_cube/apps/backend/src/modules/document/document.service.ts#L27)：

- [document.service.ts](/F:/Cursor_PRO/knowllage_cube/apps/backend/src/modules/document/document.service.ts#L27) 绑定了 `word2md_converter.py`
- [document.service.ts](/F:/Cursor_PRO/knowllage_cube/apps/backend/src/modules/document/document.service.ts#L28) 绑定了 `text2md_formatter.py`
- [document.service.ts](/F:/Cursor_PRO/knowllage_cube/apps/backend/src/modules/document/document.service.ts#L29) 绑定了 `sample.md`

调用方式：

- 上传 `.docx` 时，优先执行 `word2md_converter.py`
- 在管理端“原始文本整理导入”场景中，执行 `text2md_formatter.py`
- 上传 `.doc` 时不会调用 `word2md_converter.py`，而是回退到 `pandoc` 或 `libreoffice`
- 上传 `.pdf` 时不会调用这里的 Python 脚本，而是依赖 `pdftotext` 或 `pandoc`

这意味着仓库文档里“`.doc`/`.docx` 都通过 `word2md_converter.py`”这一说法并不完全准确，当前实现只有 `.docx` 走该脚本。

## 脚本说明

### `text2md_formatter.py`

用途：

- 输入一段纯文本
- 读取 `sample.md`
- 调用兼容 OpenAI SDK 的聊天接口
- 输出整理后的 UTF-8 文本文件

核心行为：

- 使用 `resolve_cli_path()` 将相对路径解析到 `scripts/` 目录下
- 使用 `read_text_file()` 读取模板与待整理文本
- 使用 `OpenAI(..., base_url=...)` 调用模型
- 仅输出正文，不输出说明性内容

CLI 示例：

```bash
python scripts/text2md_formatter.py --input input.txt --output output.txt
```

可选参数：

- `--sample`，默认 `sample.md`
- `--api-key`，默认读取 `DEEPSEEK_API_KEY`
- `--base-url`，默认 `https://api.deepseek.com`
- `--model`，默认 `deepseek-chat`
- `--max-tokens`，默认 `8000`
- `--temperature`，默认 `0.3`

### `word2md_converter.py`

用途：

- 读取 `.docx` 文件正文
- 读取 `sample.md`
- 调用兼容 OpenAI SDK 的聊天接口
- 输出 Markdown 风格的 `.txt`

核心行为：

- 通过 `python-docx` 的 `Document()` 读取 Word 段落
- 过滤空段落，并按空行拼接正文
- 将正文与 `sample.md` 一起送入大模型
- 返回结构化后的 UTF-8 文本文件

CLI 示例：

```bash
python scripts/word2md_converter.py --input source.docx --output result.txt
```

可选参数：

- `--sample`，默认 `sample.md`
- `--api-key`，默认读取 `DEEPSEEK_API_KEY`
- `--base-url`，默认 `https://api.deepseek.com`
- `--model`，默认 `deepseek-chat`
- `--max-tokens`，默认 `8000`
- `--temperature`，默认 `0.3`

## 依赖

这两个脚本都依赖 Python 环境。最少需要：

```bash
pip install openai python-docx
```

其中：

- `text2md_formatter.py` 依赖 `openai`
- `word2md_converter.py` 同时依赖 `openai` 和 `python-docx`

还需要设置：

```bash
DEEPSEEK_API_KEY=你的密钥
```

如果使用别的兼容接口，可以通过 `--base-url` 和 `--model` 覆盖默认值。

## Review 结论

当前目录结构基本合理，但有几个明确结论：

1. `scripts/` 应只保留“可执行脚本 + 模板文件”，不应混入测试输入和输出文件。
2. `sample.md` 是运行时依赖，不能删除。
3. `word2md_converter.py` 中的模块说明和默认文件名明显带有一次性测试痕迹，但后端通过显式参数调用，所以不影响线上调用。
4. 运行时最大风险不是脚本逻辑，而是环境依赖缺失。仓库日志里已经出现过 `openai` 依赖未就绪导致脚本启动失败的迹象，部署时必须确保 Python 包和 API Key 已配置。

## 建议

- 后续新增测试样例时，放到 `docs/` 或单独的 `scripts/examples/`，不要直接堆在 `scripts/` 根目录。
- 如果后续要长期维护这些脚本，建议把 DeepSeek 字样从实现细节中抽离，统一表述为“OpenAI 兼容接口”，减少供应商耦合感。
