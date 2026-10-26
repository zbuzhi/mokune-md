# 0.1.0 发行复核

2026-10-27。用户已明确授权发布 **未公证预览版**。这与正式 Developer ID 签名、公证发行分开处理，不把预览授权写成“已经没有法律风险”。

## 已核对的材料

- 项目自有代码采用 MIT；依赖、主题、字体各保留原许可。署名为 Mokune MD contributors，不将集合署名等同于个人/公司/职务作品权属的完整证明。
- 当前 npm 许可清单覆盖冻结锁文件与全部生产打包输入；4 个主题基础、20 个原样字体及 Sparkle 原始完整声明均保留。
- elkjs 0.9.3 的官方发布说明明确基于 ELK 0.9.1 加 PR 955。基线、补丁、包装源码和 npm 原文件已固定；补丁对基线实际应用通过，行为与上游未压缩 worker 对应。
- 转译输出中的 EMF-GWT 2.12.4 保留 **EPL-1.0**，不能只列 ELK 的 EPL-2.0。GWT/Guava、Xtext/Xtend 的源码载体与声明另列在 legal/elk-java-components.json，完整文本见 licenses/elk-java-notices.txt。
- 公开包需附第三方源码附件，包含原始 Java 基线、补丁、包装源码及 Maven 源码容器；详情见 SOURCE_AVAILABILITY.md。历史 MELK snapshot/JCenter 构建工具的逐字节复现没有验证，不将这一限制隐瞒或等同于必须安装 Java。
- 图标使用已选定的 MD7 原稿，公开截图由自编笔记生成。未审设计历史、目录缓存、个人文稿和密钥不上传。
- 仓库 zbuzhi/mokune-md 的私密漏洞报告已启用。更新公钥可公开，私钥仅在维护者本机钥匙串，不随应用或源码分发。

## 本次预览版的边界

本机没有 Apple Developer Program 付费会员、Developer ID 身份或公证配置。DMG 和 ZIP 必须标注 UNNOTARIZED-PREVIEW；Release 设为 prerelease，并说明 macOS 可能拦截首次打开。Sparkle 签名用于校验归档来源和完整性，不能替代 Apple 公证，也不作为关闭系统安全保护的理由。

正式发行门禁中的全面权属/品牌复核、长期发行身份、Developer ID、公证和跨系统实机检查仍不标为完成。一般网页名称搜索不等于商标清查；代码许可也不授予第三方商标权。预览版授权只允许如实标明这些限制后发行，不允许降低第三方许可与归档验签要求。

## 发布顺序

先固定源码提交，生成并检查本地包、许可/源码附件及 SHA256SUMS；上传预览 Release 后重新下载检查实际文件。更新清单最后生成并签名，只有下载地址、源码附件和归档签名均验证通过后才推送。不能先发布指向不存在文件的更新项。

依据：[EPL-2.0](https://www.eclipse.org/org/documents/epl-2.0/EPL-2.0.html)、[elkjs 官方 0.9.3 发布](https://github.com/kieler/elkjs/releases/tag/0.9.3)、[Apple Developer ID](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)。这些记录是工程与许可材料复核，不是全球法律意见。
