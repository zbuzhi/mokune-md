# Mokune 液态玻璃图标

基于已选定的 MD7 统一色图标，保留石墨底板和灰白绿色连字。

- `Mokune.icon`：由 Apple Icon Composer 27 新建并导入的原生图标包。
- `Mokune.icon/Assets/md-mark.svg`：手工整理的可编辑矢量轮廓。没有烘焙的高光、阴影或背景；D 内部透明。
- 底色由 Icon Composer 文稿提供，字标为独立玻璃层；轻微折射、低透明度和柔和阴影。
- `../mokune-master.png`、`../Mokune.icns`：已确认的静态兼容资源。

使用 `bash scripts/render-glass-icons.sh` 通过 Apple `ictool` 渲染外观预览，输出到 `output/icons/liquid-glass/`。

显式选择 `MOKUNE_ICON_STYLE=glass` 或 `auto` 时，主构建调用 `scripts/build-glass-icons.sh`：完整 Xcode 可用时，使用 `actool` 将 `.icon` 编译为 `Assets.car`，合并官方生成的图标声明并打包兼容 ICNS，最后签名。仅有 Command Line Tools 时，明确提示并使用静态 ICNS。无需改变系统的全局 Xcode 选择。

- `MOKUNE_ICON_STYLE=glass bash scripts/build.sh`：要求分层编译成功，否则构建失败。
- `MOKUNE_ICON_STYLE=legacy bash scripts/build.sh`：只使用原版静态图标。
- 显式 `auto`：完整 Xcode 缺失时回退；已找到 Xcode 但编译失败时直接报错，不静默掩盖错误。

2026-10-24 验证：Icon Composer 27、Xcode 27.1；macOS 26/27 的 Default、Dark、TintedLight、TintedDark、ClearLight、ClearDark 共 12 张官方渲染均成功。`assetutil` 确认最终应用包含 3 个 IconImageStack、3 个 IconGroup、1 个 Vector，以及 16–1024 像素兼容图层。完整应用构建、Info.plist 校验和严格签名校验通过。旧系统的实际运行仍需在对应系统验收。

位图拆层试稿存在杂点，未用于正式图层。矢量轮廓用于避免边缘杂点和重复材质效果。

2026-10-25：默认模式改为 `original`，通过 `../original/Mokune.icon` 将用户选定的原稿直接编译为现代图标目录；本目录的矢量重绘版仍保留，可显式构建，不自动覆盖原稿。
