# Word 风格批注 Demo

在 WordCraft 0.13.2 上复用 master 的
`rfq-react-prototype/public/word-comments.css` 和 `word-comments.html` 中的批注结构、
宋体字体栈与图标，提供随原文定位的页边批注。
不修改 RFQ 业务页面。

原版卡片、回复输入框、彩色连接线和对应原文高亮通过 DOM 显示；原文仍由 WordCraft
编辑和排版。扩展的同源消息桥提供文档代次、批注、原生排版坐标、选中状态和操作确认。
批注及回复通过原生草稿和命令进入撤销栈与 DOCX；保存前提交待写入的编辑草稿。
回传状态带已处理请求序号，防止较旧状态覆盖刚输入的文字。长卡片和密集批注支持滚动。

## 编译

需要 Rust 1.95、`wasm32-unknown-unknown` target、Git，以及
`wasm-bindgen-cli 0.2.129`（与上游 Cargo.lock 一致）。

```sh
python3 demos/craft-review/build_wordcraft.py
```

脚本下载并校验固定的上游源码，应用 `wordcraft-classic-comments.patch`，
同时加载固定版本的官方翻译，把浏览器版编译到 `site/wordcraft-classic`。
下载缓存、编译产物、导出文件均留在本项目目录，不依赖系统临时目录，也不入 Git。
本机已准备的 `.cache/toolchain` 和 `.cache/wasm-bindgen-*` 会被脚本自动识别，
后续可直接运行同一条编译命令。

上游已修改的工作副本也可通过 `--source PATH --already-patched` 构建；
`--cargo`、`--wasm-bindgen` 可以指定工具路径。

## 本地预览

```sh
python3 demos/craft-review/serve.py
```

打开 http://127.0.0.1:18771/classic.html?app=word 。
旧根地址 `/?app=word` 也会转到此预览。服务退出后，重新运行上面的启动命令即可。
`site/samples` 提供自制的中文 RFQ 示例。编辑器保存后，页头可以下载和重开保存稿，
本地导出副本留在 `site/exports`。

PDF 切换沿用此前的 PdfCraft Demo；要在新机器使用 PDF 页面，需将官方 PdfCraft
0.16.1 Web 发行包解压到 `site/pdfcraft`。

上游代码的 MIT、Apache-2.0 和第三方声明见 `licenses/`；ArtCraft 品牌资产不属于
代码许可。此处只记录对原生界面的补丁，不向上游发布或推送。

## 验证

- 固定版本的源码补丁应用检查、浏览器版 WASM 编译和重复构建通过。
- `wordcraft-ui-egui` 的 25 项批注相关测试通过，包括宿主草稿通过原生保存后再打开
  保留批注和回复，以及原生坐标随滚动变化。
- 13 项 DOM 测试通过，覆盖原版样式/图标复用、页边布局和连线、回复取消、输入焦点、
  旧回传状态与 ABA 输入顺序、密集批注滚动、文档切换和错误提示。
- 本地页面、脚本、WASM、保存接口及导出文件下载已检查；保存接口保留文件的完整字节。
- 当前 Work 设置未开放浏览器自动化，最终页面未作浏览器视觉回归；未验证外部 Word/WPS
  的兼容性。

DOM 测试使用隔离依赖，不修改 RFQ 主应用依赖：

```sh
npm install --prefix demos/craft-review/.cache/dom-qa --ignore-scripts --no-package-lock happy-dom@20.0.10
node --test demos/craft-review/tests/original-comments.test.mjs
```
