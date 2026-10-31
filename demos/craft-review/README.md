# Word 风格批注 Demo

在 WordCraft 0.13.2 中改造原生批注面板，样式参照 master 的
`rfq-react-prototype/public/word-comments.css` 和 `word-comments.html`。
不修改 RFQ 业务页面。

改动包括：白底平直卡片、紫/红/蓝侧边线、无边框批注编辑、同一卡片内的回复，
以及收进菜单的定位、解决/重新打开和删除操作。批注及回复仍走 WordCraft 的原生
命令、撤销栈和 DOCX 序列化；保存前继续提交待写入的编辑草稿。

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
- `wordcraft-ui-egui` 的 20 项批注相关测试通过，覆盖编辑、回复、保存草稿、取消编辑、
  权限拒绝、分组和异常父级关系。
- 本地页面、脚本、WASM、保存接口及导出文件下载已检查；保存接口保留文件的完整字节。
- 重启前已检查新版卡片的实际页面显示。恢复服务后，浏览器自动化在 Work 设置中不可用，
  尚未重新验证浏览器里的保存后重开操作，也未验证外部 Word/WPS 的兼容性。
