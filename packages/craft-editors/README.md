# Word / PDF 批阅组件

在 WordCraft 0.13.2 与 PdfCraft 0.16.1 上复用 master 的
`apps/web/public/word-comments.css` 和 `word-comments.html` 中的批注结构、
宋体字体栈与图标，提供随原文定位的页边批注。
独立 Demo 的入口保持不变；RFQ 项目接入方式见 [项目批阅接入说明](../../docs/development/craft-project-review.md)。

原版卡片、回复输入框和彩色连接线通过共用 DOM 界面显示；原文分别由 WordCraft 与
PdfCraft 编辑和排版。扩展的同源消息桥提供文档代次、批注、原生坐标、选中状态和操作确认。
批注及回复通过各自的原生命令进入撤销栈与 DOCX/PDF；保存前提交待写入的编辑草稿。
回传状态带已处理请求序号，防止较旧状态覆盖刚输入的文字。长卡片和密集批注支持滚动。

PDF 使用原生对象引用识别批注，删除前面的批注后仍能定位后面的卡片；页边卡片随原文
滚动和旋转，离开页面后隐藏，返回后重新显示。PDF 原有的高亮、便笺和圈画保留原生外观，
卡片提供编辑、回复、解决/重开和删除；PDF 不显示 Word 的 ¶ 按钮。
两个编辑器独立保留草稿、回复、滚动位置与保存状态。PDF 原生便笺编辑弹窗也会转到共用卡片。

## 编译

仓库已包含 `site/wordcraft-classic` 和 `site/pdfcraft-classic` 的预编译资源，普通使用直接 `git pull` 即可。RFQ 前端启动时自动校验并复制资源。只有修改原生源码或补丁时才需要执行以下构建步骤，并将新产物及 `build.json` 一起提交。

需要 Rust 1.95、`wasm32-unknown-unknown` target、Git，以及
`wasm-bindgen-cli 0.2.129`（与上游 Cargo.lock 一致）。

```sh
python3 packages/craft-editors/build_wordcraft.py
python3 packages/craft-editors/build_pdfcraft.py
```

脚本下载并校验固定的上游源码，应用 `wordcraft-classic-comments.patch`，
同时加载固定版本的官方翻译，把浏览器版编译到 `site/wordcraft-classic`。
PDF 脚本校验固定的源码、`pdfcraft-classic-comments.patch` 和官方发布所用的开源字体输入，
输出到 `site/pdfcraft-classic`，并附带字体及第三方许可。字体清单与散列见 `pdfcraft-fonts.json`。
Word 构建默认校验并内置 Noto Sans CJK SC 和 BIZ UDPGothic，字体及许可的固定版本与
散列见 `wordcraft-fonts.json`。补丁允许 Web 构建保留中文字体；缺少必须字体时构建失败，
避免浏览器画布缺字。PDF 仍沿用上游 Web 字体范围，含 BIZ UDPGothic 的常用汉字回退。
下载缓存和导出文件留在本项目的忽略目录，不入 Git。两个 `*-classic` 目录中的运行文件、许可证与构建清单随 Git 分发；属性配置保证 Windows 检出不改变这些文件的字节。
本机已准备的 `.cache/toolchain` 和 `.cache/wasm-bindgen-*` 会被脚本自动识别，
后续可直接运行同一条编译命令。

上游已修改的工作副本也可通过 `--source PATH --already-patched` 构建；
`--cargo`、`--wasm-bindgen` 可以指定工具路径。

## 本地预览

```sh
python3 packages/craft-editors/serve.py
```

打开 [Word Demo](http://127.0.0.1:18771/classic.html?app=word) 或
[PDF Demo](http://127.0.0.1:18771/classic.html?app=pdf)。
旧根地址 `/?app=word` 也会转到此预览。服务退出后，重新运行上面的启动命令即可。
`site/samples` 提供自制的中文 RFQ 示例。编辑器保存后，页头可以下载和重开保存稿，
本地导出副本留在 `site/exports`。

上游代码的 MIT、Apache-2.0 和第三方声明见 `licenses/`；ArtCraft 品牌资产不属于
代码许可，修改版 PDF 预览使用中性的 RFQ Review 文字标记。此处只记录对原生界面的补丁。

## 验证

- 固定版本的源码补丁应用检查、浏览器版 WASM 编译和重复构建通过。
- `wordcraft-ui-egui` 的 25 项批注相关测试通过，包括宿主草稿通过原生保存后再打开
  保留批注和回复，以及原生坐标随滚动变化。
- `pdfcraft-ui-egui` 原生库测试通过 627 项（上游 1 项忽略），包括 PDF 编辑/回复保存后再打开、
  删除后的稳定定位、解决/重开、原生标签切换、失败草稿保护，以及滚动、旋转和缩放坐标。
- 3 项 PDF 原生对象身份测试通过，覆盖原生弹窗、回复、状态、删除、撤销和增量保存后重开。
- 24 项 DOM 测试通过，覆盖原版样式/图标复用、页边布局和连线、回复取消、输入焦点、
  旧回传状态与 ABA 输入顺序、密集批注滚动、Word/PDF 隔离、PDF 翻页返回和错误提示。
- 本地页面、脚本、WASM、保存接口及导出文件下载已检查；保存接口保留文件的完整字节。
- 改动的 Rust 文件格式检查通过；层次检查通过（37 个 crate）。上游资源清单检查通过；
  源码归档位于忽略目录，未列入清单文件的 Git 枚举检查不完整。
- Clippy 的 `-D warnings` 检查仍被上游原有的 6 项告警阻止，位于
  `comments_panel.rs`、`app/files.rs`、`combine_ui/actions.rs` 和 `compare_ui.rs`；
  已逐文件与固定发布源码比较确认，这些文件未被本补丁修改。
- 当前 Work 设置未开放浏览器自动化，最终页面未作浏览器视觉回归；未验证外部 Word/WPS
  的兼容性。

DOM 测试使用隔离依赖，不修改 RFQ 主应用依赖：

```sh
npm install --prefix packages/craft-editors/.cache/dom-qa --ignore-scripts --no-package-lock happy-dom@20.0.10
node --test packages/craft-editors/tests/*.test.mjs
```
