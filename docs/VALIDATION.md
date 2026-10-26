# 验证

首个公开版本为 0.1.0。历史内部开发记录、原始测试结果 JSON 和设计草案保留在维护者本地，不作为公开源码的一部分。测试实现与合成文稿保留，可从源码重跑。

## 本地已完成

- 132 项逻辑测试：源文字节、行尾、Markdown 扩展、表格/图片编辑、合并、授权与源码选择、更新配置及框架符号链接边界。
- 浏览器 smoke：即时解析、脚注/元数据、科学预览、主题、HTML 导出、表格区域、多标签、选区切换和样式生命周期。
- 原生文件 23 项、原生 WebKit 21 项，实际 PDF 7 份。
- 独立会话恢复、中文插入撤销、链接移动维护及正常退出。
- 干净源码副本冻结安装与 arm64/x86_64 通用 App 构建，本地签名和 MD7 原稿图标验证。
- 更新退出保护五种情形，以及实际签名下载、篡改拒绝、取消、替换和重启链路。详见 [更新验证](UPDATE-010.md)。

本轮没有新增实体输入法候选窗口、Intel 硬件或所有旧 macOS 的实机验收。此前系统拼音/双拼验收包含用户实体键盘协助，不把程序合成事件等同于真实候选操作。

## 重跑

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run audit:licenses
pnpm run build
pnpm exec playwright install chromium
pnpm run test:release-smoke
bash scripts/test-session-native.sh
bash scripts/test-session-app.sh
bash scripts/test-update-exit.sh
node scripts/verify-update-feed.mjs
```

原生测试需要 macOS 图形会话。签名更新运行测试 `python3 scripts/test-update-runtime.py` 还需要维护者明确授权并配置的本机钥匙串更新密钥，不导出私钥；fork 应使用自己的 feed、公钥和密钥账户。

GitHub 托管 CI 的实际结果以 [Actions](https://github.com/zbuzhi/mokune-md/actions) 为准。本地通过不能替代远程结果、正式公证发行版升级验收或完整法律核验。
