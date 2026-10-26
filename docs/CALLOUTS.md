# GitHub 提示块 · 0.17.1

使用独立的标记行，后面仍是普通 Markdown 引用：

```markdown
> [!NOTE]
> **提示**与 `代码`，可直接在正文编辑。
>
> - 列表也保留原有语义。
```

支持 NOTE、TIP、IMPORTANT、WARNING、CAUTION（标记不区分大小写）。五种类型用不同颜色的标题和侧边线区分；深色主题使用适合暗底的配色。正文继续使用当前主题。即时预览不替换整个引用块、不拦截点击，选择标题行即可编辑标记。

HTML/PDF 与即时预览共用类型识别和配色。Markdown 源文中的标记、空白、换行、BOM 不因渲染或导出改写。Markdown 的软换行在 HTML/PDF 中按标准合并，显式硬换行仍换行。

按 [GitHub 官方语法](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts) 识别顶层引用的独立首行。未知类型、反斜杠转义、代码块、行内示例、带自定义标题的标记行及列表/引用中嵌套写法不转成提示块，原文保留。此项不是 Obsidian 的全部 callout 方言。

实现检查中发现 Lezer 还会把无定义的 `[!NOTE]`/`[!CUSTOM]` 当作候选引用链接；即时渲染现在保留无定义引用的括号，并避免对提示标题叠加链接装饰。真实定义链接及空目标 `[]()` 仍保留既有语义。

验证入口：`test:callouts`、`test:webkit-interaction`、`test:markdown:pdf`。本轮新增 3 项模型测试、7 组浏览器检查、2 项原生 WebKit 检查，实际生成浅/深主题 PDF 并检查内容。另回归链接导航、拖选、脚注与 Front Matter、多标签、CommonMark 样例及全量逻辑测试。组合输入检查为程序化事件保护，未声称新增实体拼音候选窗验收。
