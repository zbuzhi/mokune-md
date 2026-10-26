# Mokune 正式应用图标

采用用户选定的 MD7 统一色版本：石墨底色、灰白绿色 MD 连字，无异色方块。

- `mokune-master.png`：透明背景母版，保留深色圆角底板。
- `Mokune.icns`：Mac 应用图标，由 `bash scripts/build-icons.sh` 生成。
- 设计稿：`provenance/MD7-unified.png`。
- 透明母版使用内置 image_gen 编辑，提示词见 `production-prompt.json`。

主构建流程自动生成 16–1024 像素图层并将 ICNS 复制到应用资源目录。

默认构建 `MOKUNE_ICON_STYLE=original` 直接使用原始 PNG 母版编译现代 `Assets.car`（源项目见 `original/Mokune.icon`），保留原稿字形和材质，同时支持系统的普通、深色、透明等图标外观。兼容 ICNS 仍与母版生成的静态资源逐字节一致。仅缺少完整 Xcode 时回退为静态 ICNS。

`liquid-glass/` 内的手工矢量重绘版仍保留，只有明确指定 `MOKUNE_ICON_STYLE=glass` / `auto` 才会使用。`legacy` 可显式选择仅静态 ICNS。

2026-10-25：修复检测到 Xcode 就自动用重绘字形覆盖原稿的问题；纯 ICNS 在当前 macOS 被额外套浅色底板，因此最终默认采用“原稿 + 现代图标目录”的打包方式。构建末尾验证原稿 PNG、兼容 ICNS、图标声明和目录中的 `approved-md7` 资源，拒绝混入 `md-mark` 重绘字标。
