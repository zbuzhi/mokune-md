# 主题、排版与正文宽度

在“外观与主题”中，社区精选排在最前。主题影响正文字体、标题字体与颜色、分隔线、引用背景、代码面板和语法高亮，也同步用于 HTML / PDF 导出。

## 社区精选

以下均为针对 Mokune 编辑器的适配，使用系统字体代替上游字体包，未直接加载 Typora CSS。固定源码、完整 MIT 许可与提交记录保存在 vendor/themes/；应用内第三方声明和社区主题导出文件中也保留了许可。

| Mokune 主题 | 基础项目 | 设计侧重 |
| --- | --- | --- |
| 熊系纸白 / 熊系暮色 | [Ursine](https://github.com/noatpad/typora-theme-ursine) | 书页衬线标题、柔和引用、圆角代码面板 |
| 澄蓝文档 | [Drake Google](https://github.com/liangjingkanji/DrakeTyporaTheme) | 清晰的文档层级、二级标题分隔线、蓝色引用 |
| 德古拉 | [Dracula for Typora](https://github.com/dracula/typora) | 紫粉标题、深色面板与多色语法 |
| 拿铁 / 摩卡 | [Catppuccin palette](https://github.com/catppuccin/palette) | 暖亮/柔暗粉彩、多层次代码与引用 |

2026-10-24 核对 GitHub：Drake 3,554 stars、Ursine 739、Catppuccin palette 744、Dracula Typora 27。星数会变化，不表示永久排名。原有 10 套原创配色继续保留。

## 正文宽度

“正文宽度”保留紧凑 640、舒适 720、宽阔 880，新增“铺满 · 少量留白”。铺满模式使用整个可用编辑区，通常两侧各留 40px；窄窗口右侧 30px。侧栏或外观面板打开时会自然收缩。设置本地记忆，HTML 使用同一宽度策略，PDF 继续按照 A4 页面排版。

标题标记保持在源文中，仅把小号标记悬挂到页边；一至六级标题与正文共用起点。选区、撤销和原始行尾不参与视觉重排。非活动行的行内标记保留微小、非零占位，减少加粗和引用周围的大空隙；活动行恢复标记，组合输入期间冻结排版。

## 手动添加主题

点“导出当前”，得到 .mokune-theme.json；用文本编辑器修改后，点“＋ 导入主题”。也可直接导入项目中的 themes/handmade-book.mokune-theme.json。导入后显示于“我的主题”，支持移除和下次启动恢复。

文件格式为 mokune.theme.v1，必填 name、dark 和 colors 的 background / foreground / accent / surface / border，颜色使用 #RRGGBB。可设置更多文字与语法颜色。style 支持：

- bodyFont / headingFont：modern、book、rounded、technical，均为系统字体组合。
- lineHeight：1.5–2.1；headingWeight：400–750；headingScale：1.5–2.3。
- headingRule：标题分隔线；codeRadius：0–16；codeBorder：代码面板边线。

主题上限 128 KB，可保存 20 套自定义主题。当前只接受结构化 JSON，不直接导入任意 Typora CSS、脚本、字体或远程资源。社区主题的 attribution 应保留；导出模板会一并带上原始许可。


