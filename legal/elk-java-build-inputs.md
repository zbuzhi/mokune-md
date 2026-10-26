# elkjs 0.9.3 首选源码与构建输入复核

2026-10-27。此项复核解决源码对应与声明材料，不宣称完成逐字节重建、所有历史工具链复现或全面法律清场。

## 官方版本依据

官方发布说明 https://github.com/kieler/elkjs/releases/tag/0.9.3 明确写明基于 ELK 0.9.1，并包含 Eclipse ELK PR 955。Java 基线固定为 `62d5909f96fad541bc101ad52dabaece6b7eab7e`；补丁固定为 `7ca51784e42a24201f29bc13e458728b6fc61cdc` 的变更。

基线 archive SHA256 为 `51212e3edb105296e2ec8e288e6097d3fc124d25af98a5a64f09655aa1fca842`；补丁 SHA256 为 `77199cb3428c5c635932dedcd96d250f6e1b91483559eaa3d8179977ad2b8f71`。补丁已对全新解出的基线执行 git apply --check 并实际应用成功。上游未压缩 elk-worker.js 中的 NodeContext.topdownLayout 以及 setNodeWidth/setNodeHeight 对 Math.max 的条件调用与该修复一致。

ELK 主仓库的 merge commit 含发布说明等旁支变化，不将整个 merge tree 冒称为 0.9.1 tag。提供的是官方明确声明的基线加指定补丁。elkjs 自身的 Java/JS/GWT 包装与覆盖源码来自 `a8304cf79fde75bc2ab1a89d28320f53f8637436`，原 npm 文件也已与该提交 Git blob 对上。

## Java 来源组件

固定 build.gradle 声明 GWT 2.10.0、Guava 31.1-jre、EMF-GWT 2.12.4、Xtext/Xtend 2.28.0。相应 Maven Central 源码载体已实际下载、检查 Java 文件和许可头并计算 SHA256；清单为 legal/elk-java-components.json。ELK 工作者中的 Java 类型元数据显示 GWT/JRE 仿真、Guava、ELK、EMF、Xbase 来源族。源码容器还包含未被 GWT 保留到最终 JS 中的代码，不把全部 Java 类都称为应用运行时。

EMF-GWT 的父 POM 和源码头均为 EPL-1.0，不能只用 elkjs 外层 EPL-2.0 覆盖；完整 EPL-1.0 与代表性原声明保存在 licenses/EPL-1.0.txt 和 licenses/elk-java-notices.txt。GWT/Guava 保留 Apache-2.0；Xtext/Xtend 源码及 about 文件保留 EPL-2.0。源代码载体完整保留原作者头信息。

## 源码获取与复现限制

Java 基线、补丁、包装源码及 Maven 源码载体有固定 URL 和本地校验值，公开二进制应随附 third-party-sources.zip，或提供同样稳定合理的获取方式。使用 scripts/fetch-elk-sources.mjs 获取并核验材料，不需要在用户 App 中安装 Java。

历史构建脚本还声明 MELK 0.10.0-SNAPSHOT，并使用 JCenter；没有保留该次发布解析到的精确 snapshot 编译器。本轮没有声称用今天的 Gradle/Java 可以逐字节复现上游 GWT 输出。该限制保留为历史构建可重复性说明，不再把它与 ELK/EMF 首选源代码是否可获取混为一项。发行审核以真实版本声明、源码材料及声明保留为依据。
