<p align="center">
  <img src="assets/icons/mokune-master.png" width="80" alt="Mokune MD 图标">
</p>

<h1 align="center">Mokune MD</h1>

<p align="center">macOS 上的本地 Markdown 编辑器</p>

<p align="center">
  <a href="#开始使用">开始使用</a> ·
  <a href="docs/EDITING.md">编辑操作</a> ·
  <a href="docs/THEMES.md">主题</a> ·
  <a href="LICENSE">MIT</a>
</p>

写笔记、整理技术文档，直接打开本地 `.md` 文件就能开始。写的时候看排版，按 `⌘/` 切回源码。

不用注册账号，文稿留在自己的电脑上。

![Mokune MD：明亮主题下的编辑界面](docs/screenshots/editor-light.png)

## 平时会用到的

- **写长文**：多标签、大纲、文件夹树和全文搜索。关掉再打开，也能接着上次的位置写。
- **整理内容**：表格里直接改字，拖动图片边缘调整大小；代码高亮、公式、Mermaid、脚注和 Front Matter 也都支持。
- **管理文稿**：未保存内容恢复、本地版本历史、磁盘冲突比较；文件移动后维护相对链接。
- **交付文档**：按当前主题导出 HTML 或 PDF，带上图片、公式和图表。

内置 16 套主题，也可以导入自己的主题。正文宽度、字号和大纲位置都能调整。

<details>
<summary>深色主题</summary>

![Mokune MD：深色主题与代码高亮](docs/screenshots/editor-dark.png)

</details>

## 开始使用

**0.1.0 暂时只提供源码，安装包还没发布。**

本地构建需要 macOS 13.3+、Xcode、Node.js 24 和 pnpm 11.25.0。

```sh
git clone https://github.com/zbuzhi/mokune-md.git
cd mokune-md
pnpm install --frozen-lockfile
pnpm build
open "dist/Mokune MD.app"
```

只装了 Command Line Tools 的话，可以用 `MOKUNE_ICON_STYLE=legacy pnpm build` 构建静态图标版。更多构建选项见 [构建指南](docs/BUILDING.md)。本地构建使用临时签名，尚未经过 Apple 公证。

应用已经接入在线更新。首个安装包发布后，手动安装一次，后续就能从应用菜单检查更新；目前更新源里没有安装包。

## 几个常用操作

| 操作 | 快捷键 |
| --- | --- |
| 保存文稿 | `⌘S` |
| 切换源码与即时预览 | `⌘/` |
| 快速打开文稿 | `⌘P` |
| 打开命令面板 | `⌘⇧P` |
| 查看快捷键提示 | 按住 `⌘` 半秒，松开收起 |

完整列表见 [快捷键说明](docs/SHORTCUTS.md)。

## 文档与反馈

[编辑操作](docs/EDITING.md) · [Markdown 支持范围](docs/MARKDOWN-COVERAGE.md) · [图片与附件](docs/RESOURCES.md) · [导出](docs/EXPORT.md)

遇到问题，欢迎提 [Issue](https://github.com/zbuzhi/mokune-md/issues)，带上系统版本和复现步骤就好。想改代码可以看 [贡献指南](CONTRIBUTING.md)；安全漏洞请走 [私密报告](SECURITY.md)。

## 许可

项目代码采用 [MIT](LICENSE)。依赖、主题和字体保留各自许可证，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。
