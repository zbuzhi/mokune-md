# GitHub 开源前授权与风险复核

2026-10-26；早期本地准备版 0.17.4 的复核记录；现首个公开源码版本为 0.1.0，用户已授权公开源码预览，仍不发行安装包。结论：工程材料可以继续整理，但不能表述为“已无任何法律风险”或已经放行公共二进制。

## 本轮已修复与核验

| 项目 | 当前证据 |
| --- | --- |
| 自有代码许可 | 按用户选择，根 LICENSE 改为完整 MIT 原文，新增 NOTICE、贡献与 DCO、隐私、安全报告政策。第三方不被统一重标为 MIT。版权主体仍不从本机用户名猜填。 |
| 依赖覆盖 | 遍历冻结锁文件与已安装包，覆盖全部生产 esbuild 输入，拒绝缺失许可、未知许可、锁文件漂移或未归属组件。当前本机 184 个已安装包、128 个实际运行时组件；构建/未打包组件单列。另有字体/主题 SBOM 与真实依赖边。pnpm peer 目录命名也纳入归属，不靠静默 catch 忽略。 |
| 双许可与字体 | DOMPurify 明确选择 Apache-2.0；KaTeX 代码 MIT，20 个未修改字体继续保留 OFL、版权与原名。系统字体及 Apple 框架没有作为文件复制分发。 |
| 主题 | 四个固定上游提交的 LICENSE 和所有参考 CSS/SCSS/palette 文件已在线逐字节比对，本地哈希在 legal/theme-provenance.json。Ursine/Drake/Dracula/Catppuccin 为适配基础，不冒称官方；未打包其外部字体/图片，CSS 不直接执行。 |
| ELK | npm 的 elk.bundled.js 与 0.9.3 固定 tag 的 Git blob 一致；已下载 wrapper/Java 补丁/Gradle/GWT 配置归档并记录 SHA256。没有把生成 JS 叫作完整首选源码。确切上游 ELK Java 版本、构建输入及 GWT/Guava/EMF 等嵌入部分的声明仍未核清，公共二进制门禁保持失败，见 SOURCE_AVAILABILITY.md。 |
| 图标/演示 | 保留批准的 MD7 PNG、生成提示、参考图、现代图标文稿和 ICNS。可公开素材有哈希；仅使用自编测试文稿截图。未审历史设计图仍在本地，排除在草稿之外并列入默认 Git 忽略；不删除用户原始文件。 |
| 隐私/凭证 | 发现并修复测试中的固定本机路径；历史 PDF 测试结果中的本机路径改为项目相对路径并标注脱敏，原始记录留在忽略的 .build。源码清单检查只报告路径/类别/行号，不打印命中的凭证值。 |
| 构建/分发 | 版本与构建元数据单一来源；冻结安装，清洁源代码验证，宿主/Intel/通用目标编译与架构校验，附带许可证、源码说明、隐私和 SBOM。生成本地草稿及哈希；没有发布命令自动执行。 |
| 已知安全公告 | 本次 pnpm audit 查询在 2026-10-26 返回 0 项已知漏洞；仅代表该服务/锁文件/查询时点，不是安全保证，不覆盖系统 WebKit/未知漏洞，也不能替代许可审查。 |

## 仍待确认：分别是什么性质

1. **公开署名、仓库与权利归属（人工）**：可以使用有权使用且可核对的公开署名，但维护身份、个人/公司/职务作品与未来贡献权限要真实确认。项目名称不是对所有代码版权持有人的证明。当前字段待定，未制造邮箱/owner。DCO 针对贡献来源，不是版权转让。
2. **名称/图形商标与来源（人工/法律）**：对 Mokune、Mokune MD、mokune-md 做过一般网页/GitHub 名称检索，未据此给出可注册结论；未完成目标地区注册库、音形近似、MD7 图形或专利检索。本项目的代码许可不代表取得第三方名称或图形的商标使用权。准备商业化或跨地区发行时应结合发行地区做专业复核。
3. **EPL 首选源码（公共二进制）**：EPL-2.0 第 3 节要求提供适用的源码获取说明/渠道及许可。固定 wrapper 归档确实存在，但 build.gradle 需要外部 ELK Java checkout，且该 tag 的 meta-language 写为 snapshot；不能猜一个 Java release 就标成核清。严格门禁是本项目的审慎发行策略，不表示 EPL 要求每个对象逐字节可重复构建。仅公开本项目源码不自动替代附带组件的源代码义务。
4. **Typora 等参考边界（来源/法律）**：实现常用 Markdown 功能与学习交互不等于可以复制受保护代码、图标、文案、截图或专有主题。当前实现使用 Swift/AppKit/WebKit、CodeMirror 和开源渲染库，未发现目录中包含 Typora 私有程序；这不等于能证明每行代码的完整历史或排除所有界面表达、不正当竞争和专利争议。不使用“官方”“免费 Typora”等混淆性品牌。
5. **AI 素材（权利边界）**：提示和批准记录能解释来源，不能证明独占著作权、世界范围非侵权或商标可用。适用的服务条款和人工贡献范围需结合实际账号/使用方式判断；未把 AI 生成等同于自动无版权风险。
6. **安全联系与实际提交清单（发行治理）**：目前还没有可验证的私密报告渠道。公开前配置真实渠道，审阅源代码精确清单及素材；自动扫描不证明没有所有敏感信息。源码、二进制的门禁分开，见 output/release-readiness.json。
7. **Developer ID/公证、长期 bundle 身份与架构系统（发行可信度）**：当前仍 ad-hoc，正式签名、公证、Intel 运行与旧系统实机检查未完成。仅增加目标编译和本地验证不等于完成上述步骤。保持历史数据标识，避免未经迁移使草稿失联。

所有项目都区分工程事实与人工/法律结论；本轮不把待定项勾成已完成。公开前的最终核查应使用对应版本/清单，而非旧包的结果。

## 依据与入口

- [MIT 原文](https://opensource.org/license/mit)，适用于本项目自有代码。
- [Apache-2.0 原文](https://www.apache.org/licenses/LICENSE-2.0)，特别是第 4/6 节。
- [EPL-2.0 原文](https://www.eclipse.org/org/documents/epl-2.0/EPL-2.0.html)，定义与第 3 节；[elkjs 固定源码](https://github.com/kieler/elkjs/tree/a8304cf79fde75bc2ab1a89d28320f53f8637436)。
- [OFL 官方原文](https://openfontlicense.org/open-font-license-official-text/)。
- [《计算机软件保护条例》](https://www.cac.gov.cn/2013-02/08/c_12648744.htm)，第 6 条及著作权相关条款；不能从思想不受保护推出具体表达可以复制。
- [USPTO 近似商标检索说明](https://www.uspto.gov/trademarks/basics/why-search-similar-trademarks)；[综合检索范围](https://www.uspto.gov/trademarks/search/comprehensive-clearance-search-similar-trademarks)。
- [DCO 1.1](https://developercertificate.org/)、[Apple 公证流程](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)。
- [从源码构建](BUILDING.md)、[本地发布草稿与门禁](RELEASING.md)、PRIVACY.md、ASSET_PROVENANCE.md。

## 0.1.0 源码预览更新

GitHub 仓库已确定为 zbuzhi/mokune-md；MIT 采用集合署名 Mokune MD contributors，不推定个人、公司或职务作品的完整权属。GitHub 私密漏洞报告已通过 API 确认启用。用户明确授权公开源码预览和本机更新密钥创建；私钥没有导出，源码只有公钥。Sparkle 2.10.1 及完整嵌入声明已纳入许可与 SBOM，真实隔离更新链路见 UPDATE-010.md。初始线上更新清单为空，不分发安装包。原先记录的全面权属、品牌、ELK 源码和正式签名公证待办仍不因此自动完成。
