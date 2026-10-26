# 从源码构建

项目使用 Node 24（.node-version 为 24.19.0）、pnpm 11.25.0（packageManager 固定）、Swift/AppKit/系统 WebKit。无 Electron、额外 Chromium 运行时或 WASM。Playwright 仅为开发测试依赖，不进入应用。

## macOS

安装完整 Xcode、接受其协议并完成首次组件准备；默认图标使用 Apple 的 .icon 文稿，当前本机用 Xcode 27.1 验证。旧 Xcode 的 actool 未必支持此格式；可显式 `MOKUNE_ICON_STYLE=legacy` 使用同一 MD7 静态 ICNS 做编译检查。该 CI 变体不代表液态玻璃发行包已验收。只装 Command Line Tools 时默认可回退静态图标，但编译器仍需可用。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build
```

默认输出 `dist/Mokune MD.app`，为宿主架构、ad-hoc 本地签名；不会安装、重启用户 App、创建仓库或上传发布。版本只读 package.json，构建号、bundle ID 和最低部署版本在 app.build.json，不再在 shell 中重复写版本号。

```sh
MOKUNE_ARCH=arm64 pnpm run build
MOKUNE_ARCH=x86_64 pnpm run build
MOKUNE_ARCH=universal pnpm run build
```

universal 从两个独立目标编译后 lipo 合并并验证架构。编译包含 Intel 不等于已经在 Intel Mac 上运行验收；最低部署目标 13.3 也不等于所有旧版系统都做过实机检查。当前系统及工具链写入 dist/build-manifest.json。

## 检查与测试

```sh
pnpm run audit:licenses
pnpm exec playwright install chromium
pnpm run test:release-smoke
pnpm run release:check
```

浏览器测试需要仅绑定 127.0.0.1:4173 的临时服务；release-smoke 自行管理服务器、创建测试输出和自编图片，端口被占用会失败，不复用不明服务。默认从本项目开发依赖加载 Playwright；可用 CHROME_EXECUTABLE 指向本机浏览器。Linux CI 使用 `playwright install --with-deps chromium`，仅检查 web/授权/模型，不编译 AppKit 应用。

Smoke 顺序生成所有所需的 HTML，再在 macOS 执行原生 WebKit 与实际 PDF 检查；不会依赖本机旧的 output、截图或私人文件。更耗时的五分钟基准通过 test:performance:dense 单独运行，不拖慢每个普通 PR。

完整授权证据下载为显式网络步骤 `node scripts/fetch-license-evidence.mjs`，常规构建不联网抓主题；从已提交的固定哈希验证。该下载不代表 ELK 首选 Java 源码已核清。

## 构建可追溯性

冻结 pnpm-lock、锁文件完整性、四个固定主题提交、20 个字体哈希及实际 esbuild 输入覆盖都参与检查。dist/build-manifest.json 记录版本、架构、工具链、SBOM、锁文件及每个应用文件哈希。依赖声明变化、无法归属的实际打包组件、缺少许可或已审素材变化都会失败。

这提供可重复的流程和可核对输入，不宣称不同 Xcode/系统/签名时间会产生逐字节相同的 .app。代码签名、公证、系统资源编译和平台开发依赖可能影响输出；需要比较对应工具链及清单。

package.json 中 private: true 只用于防止误发 npm 包，不影响把源码发布到 GitHub。

.gitattributes 对代码使用 LF，对上游主题/许可、批准素材及原样保存测试夹具保留原始字节，避免 Git 自动换行破坏来源哈希或 BOM/混合行尾样本。

## 0.1.0 在线更新框架

标准 macOS 构建先下载 legal/sparkle.json 固定的 Sparkle 2.10.1 分发归档，核对 SHA256 和完整许可，再链接并用 ditto 保留框架符号链接。复制官方已签名的 helpers，签署外层 framework 和 App；正式签名仍使用 Developer ID。构建缓存留在 .build，不提交二进制。update.config.json 仅含公开验签公钥和 HTTPS feed；enabled=false 时不生成更新菜单或发出更新请求。用户已授权的私钥只在维护者钥匙串中，克隆仓库不需要也不能取得它。

`bash scripts/test-update-exit.sh` 在隔离数据目录检查更新退出握手、取消、组合输入和写入失败；不要拿个人文稿测试安装替换。
