---
title: 代码与文字之间
author: Mokune
tags: [Rust, macOS, Markdown]
status: 草稿
description: |
  保持原文，让表达自然发生。
  元数据、脚注与正文拥有同一套排版。
---

# 代码与文字之间

让思绪留在正文，把补充说明交给脚注[^design]。再次引用同一条说明[^design]，依然只有一个编号。

## 为程序员，也为写作者

一份 Markdown，可以同时容纳思考、公式与流程。实现细节见脚注[^code]。

> 编辑与导出应当来自同一份原文。

[^design]: 简洁的界面，也需要 **完整的表达**。行内公式 $E=mc^2$ 与链接 [Mokune](https://example.com) 都保留在脚注里。

    第二段补充说明，中文、空格与标点都应如实呈现。

[^code]: 工程说明与测试资源。

    | 功能 | 约束 |
    | --- | --- |
    | 原样保存 | BOM / CRLF |
    | 中文输入 | 候选不跳位 |

    ![测试图片](assets/preview.svg)

    ```mermaid
    flowchart LR
      A[源码] --> B[即时预览]
      B --> C[主题导出]
    ```

    $$x^2 + y^2 = z^2$$
