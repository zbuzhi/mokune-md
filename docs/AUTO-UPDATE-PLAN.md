# GitHub 发布与在线更新方案

状态：首个公开版本 0.1.0 已接入 Sparkle 2.10.1；实际验收记录见 docs/UPDATE-010.md。安装包尚未公开，初始 appcast 为空。后续二进制发行仍需完成 RELEASE-LEGAL-REVIEW.md 的事项。

## 技术选择

macOS 使用固定版本 Sparkle 2.10.1，完整上游及嵌入组件许可保存在 licenses/Sparkle-2.10.1.txt；GitHub Releases 承载应用包，appcast.xml 放在稳定的 HTTPS 地址 `https://raw.githubusercontent.com/zbuzhi/mokune-md/main/updates/appcast.xml`。优先选一个可以长期维护、不会因每次版本号改变的 feed 地址。Sparkle 对接原生菜单与生命周期，避免自行实现下载覆盖安装。

当前用 swiftc 脚本构建，没有 Xcode 工程；可按 Sparkle 官方手动框架集成方式，复制并正确签署嵌套组件、设置 rpath，不能只复制最外层文件或以 --deep 代替规范签名。后续 Windows 使用对应更新器，保持相同的发布版本策略，不直接复用 macOS 二进制更新器。

## 用户体验

- 应用菜单增加“检查更新…”；设置中提供自动检查开关和更新通道，首版只做稳定版。
- 显示版本号、更新说明、体积；允许稍后安装，下载失败仍可正常编辑。
- 安装重启前，先提交或等待中文组合输入、格内编辑和图片尺寸操作完成，再原子保存恢复会话；未保存文稿继续走现有逐份退出保护。用户取消退出则取消安装，不强制杀进程。
- 恢复全部标签、顺序、当前文稿、草稿及阅读位置。恢复格式需要向后兼容；安装前保留备份。
- 当前撤销历史仅在进程内保留；更新重启也会开启新撤销会话。不能把“草稿恢复”描述为“完整撤销历史恢复”。

## 分发链

1. 定稿名称、GitHub owner/repo、稳定 bundle ID；改 bundle ID 时迁移旧应用的本地会话/偏好/历史，不能让用户误以为文稿丢失。
2. 首个支持更新的公开版本就包含 SUPublicEDKey、SUFeedURL 和 Sparkle。内部 0.17.x 及此前本地版本未带更新器，首次需要手动安装；之后才能应用内更新。
3. Apple Developer ID 证书与公证凭证用于应用签名；Sparkle EdDSA 密钥单独用于更新归档验签。公钥进应用，私钥放钥匙串或受保护的 CI Secrets，准备离线备份。
4. 清洁的 macOS CI 从 pnpm-lock.yaml 安装；测试、许可检查、图标检查、arm64/x86_64 构建并验证支持范围。标准构建支持宿主架构和显式 universal；实际跨架构运行仍需验收。
5. 从内到外正式签名、检查 Hardened Runtime；notarytool 公证、staple。用 ditto 保留框架符号链接打包，用 generate_appcast 生成带 EdDSA 签名的 feed。构建号严格递增，不能只比较显示版本字符串。
6. GitHub Release 先准备为草稿：应用归档、校验和、更新说明、许可与源码材料。验证安装和 feed 后，再按明确的发布授权发布；先发布归档，最后更新 feed，避免向用户推送尚不存在的下载。
7. 升级测试至少覆盖：手动/自动检查、无网/超时、无效签名拒绝、旧版本不降级、不同架构、安装位置权限、组合输入、多个脏标签、取消退出、恢复损坏/中断，以及新安装与旧版升级的图标一致性。

GitHub 被限流或网络不可达时应温和提示。镜像可后续增加，但所有镜像必须复用同一个已验签归档，不因 HTTPS 就省去验签；检查失败不能自动回退到不安全安装。

## 接入前需要确定的信息

最终品牌、GitHub owner/repo、Apple 发布主体和证书、稳定 feed URL、Sparkle 公钥。账号/仓库为 zbuzhi/mokune-md。更新密钥经用户明确授权后创建，私钥留在 macOS 钥匙串 mokune-md.zbuzhi 账户；源码仅有公钥。未知的 Apple 签名身份不填假值，私钥或密码不得提交。

参考：[Sparkle 集成](https://sparkle-project.org/documentation/)、[发布与签名](https://sparkle-project.org/documentation/publishing/)、[Apple 公证](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)。
