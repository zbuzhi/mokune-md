# 发布准备与本地草稿

当前以 `zbuzhi/mokune-md` 进行用户授权的源码预览公开；不上传安装包、不创建二进制 Release、不提交 Apple 公证。初始签名 feed 为空。0.1.0 已接入更新框架；公开安装包与首次更新仍需另行发行验收。

## 本地检查

```sh
pnpm install --frozen-lockfile
pnpm run audit:licenses
pnpm test
pnpm run build
pnpm run test:release-smoke
pnpm run release:check
node scripts/fetch-license-evidence.mjs # 显式下载并核验本地草稿所需源码证据
pnpm run release:prepare -- --with-app
```

最后一步只在 `.release/mokune-md-<版本>-build<构建号>-draft/` 创建可检查的源码目录/ZIP、源码逐文件哈希清单、发布状态、应用本地草稿 ZIP、ELK wrapper 源码证据和 SHA256SUMS。目标已存在时拒绝覆盖，并在临时目录完成后原子移入，失败不留下貌似完成的候选。也可显式传 --app 与 --build-manifest 使用隔离构建的产物，不覆盖正在运行的 App。草稿中的 ad-hoc App 不是公证发行包；程序内没有 GitHub 上传命令。

源码选取采用明确路径/文件类型及素材哈希，拒绝秘密/本机 home 路径与 symlink，排除 node_modules、dist、output、.build、历史 design/docs/design、未审二进制及签名凭证。不删除这些本地原稿。公开图片只取 legal/public-assets.json 记录的版本，README 使用经过核对的自编测试文稿截图。

检查仍不能替代人工审阅：阅读 output/source-manifest.json 的确切文件清单，核对注释、文稿、图片、权限、联系人和最终提交内容。忽略规则不会自动清除未来 Git 历史里已经加入的文件。

## 门禁与待定字段

`release:check` 在工程通过时返回本地准备状态，不宣称允许公开；`release:check:source`、`release:check:binary` 是严格检查，待办未完成即失败。ELK 不能仅填一个 tag 就放行：需要固定 Java commit、明确的 review 状态和 legal/elk-java-build-inputs.md 的匹配哈希；该人工审阅说明应列清源码获取与嵌入组件声明，机器只核对记录完整性，不替代法律判断。Source 与 binary 分开：只公开自有源码和依赖锁文件，不等于已经可以分发带 ELK 的合成 JS 二进制。

- `legal/release-state.json` 的仓库 owner/repo、真实/有权使用的公开版权署名、权限确认、品牌复核和私密安全渠道待定。不要把个人目录名当作版权主体。
- 先填写其余待定字段，再审阅当前源码清单，将 release:check 给出的 sourceReviewSHA256 写入 reviewedSourceManifestSHA256；复查时仅将该确认字段本身归零计算，避免自引用无解，其余文件/状态变动仍使旧确认失效。该确认不是法律免责声明的替代。
- 二进制还要求 ELK 首选 Java 源码/构建输入复核、长期 bundle 身份及实际 Developer ID/Hardened Runtime/staple 验证。当前 local.mokune.editor 和历史数据位置继续保持兼容，未擅自更改或迁移用户数据。

品牌复核是发布决策的检查项，并非声称开源必须先取得商标注册。配置完整也不会自动发布。最终建立公开仓库或上传必须另有明确操作指令。建议把经过核对的 source 草稿内容作为独立 mokune-md 仓库根目录，保留本地多工具工作区布局。

## 签名与公证流程（未执行）

`bash scripts/sign-and-notarize.sh --plan` 只打印计划，不读私钥、不上传。未来明确执行 --execute 时，使用已有 Keychain Developer ID 身份和 notarytool 凭证配置名，不把密码/私钥写入项目；先通过源码及 EPL 门禁，再复制 App 到独立 staging，从而不修改正在使用的应用。

脚本包含 Sparkle 官方的明确逐层签名顺序：Installer.xpc、Downloader.xpc（保留 entitlements）、Autoupdate、Updater.app、Sparkle.framework、主 App。启用 Hardened Runtime 和时间戳，验证签名后才显式上传 Apple、检查 Accepted、staple、再打包和计算哈希；不使用 --deep 签名。此流程尚未使用真实 Developer ID/公证服务执行。

当前没有证书和公证配置，不能把脚本语法/本地计划验证描述为完成了正式签名或公证。另须验证 Gatekeeper、新安装、旧版本升级、取消退出、恢复会话和旧系统/不同架构。签名不是版权/商标无风险证明。

## CI 状态

.github/workflows/check.yml 使用固定提交的官方 Actions、只读权限、冻结安装、web/授权/测试和 macOS 双架构编译；不使用 pull_request_target、不读取签名 Secrets、不打 tag、不创建 Release、不上传 App 或合成 JS。仅上传工程报告，避免在 EPL/权利审查完成前经 CI 分发二进制。

本机清洁源码构建用于验证等价命令；托管 CI 的实际状态以 GitHub Actions 为准，不用本地通过替代远程运行结果。CI 选择静态图标进行兼容编译，默认本机构建仍保留批准的现代 MD7 原稿。

## 更新归档

`node scripts/prepare-update.mjs` 只显示计划；明确 `--execute --app PATH` 后仍要求通过公共二进制门禁、实际公证与通用架构，并核对 App 的 feed/公钥与钥匙串的公钥。然后仅在 .release 创建归档、Sparkle 签名 appcast 和校验和，不上传、不修改线上 feed、不导出私钥。先发布归档，验证下载和签名后再更新线上 appcast；不得直接编辑已签名 XML。0.1.0 使用构建号 30，后续构建号递增。

### 源码预览与正式发行

用户已明确授权先公开 MIT 源码预览，并知悉 ELK/品牌/正式二进制待办。legal/release-state.json 分别记录 sourcePreviewPublicationAuthorized 与 binaryPublicationAuthorized；这不是把尚未完成的 rightsConfirmed、brandReviewComplete 或正式发行门禁改成通过。当前公开源码清单经过白名单、隐私检查、逐项文件清单检查；个人/职务作品权属与品牌的全面法律核验仍未完成。严格 release:check:source 为正式发行准备检查，不代表源码预览已经取得法律清场结论。
