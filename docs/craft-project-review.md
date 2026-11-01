# RFQ 项目 Word / PDF 批阅接入

分支：`codex/rfq-craft-document-review`。详情左侧直接使用 WordCraft 0.13.2 / PdfCraft 0.16.1，批注卡片、回复、图标及连线复用已确认的 Demo；右侧继续使用现有协作记录。

## 本机入口

[RFQ-001 第 6 条](http://127.0.0.1:5174/#/response?projectId=RFQ-001&requirementId=RFQ-001-DOC-EXAMPLE-6)。首次打开「条款状态示例.docx / V1.0」会关联内置的真实 DOCX，已有上传文件优先。新入口与旧 `5173` 属于不同浏览器存储来源，因此各自保留业务演示数据。

RFQ-001 的商务 V1.1、技术 V2.0、状态矩阵 V1.0 也提供 Word 批阅演示文档，覆盖剩余
12 条模拟要求，切换示例卡片继续使用与独立 Demo 相同的 Word 编辑器和工具栏。
这些文档由现有模拟条款生成并明确标注为演示摘录，不代表客户的 Excel 或 PDF 原件。
已上传的文件或旧文件引用优先，不以演示文档替换；其他项目及其他来源版本不自动套用。

## 启动

在仓库根目录构建并启动独立后端：

```sh
docker build -t rfq-craft-service:local rfq-service
docker run -d --name rfq-craft-service-local \
  -p 127.0.0.1:48083:48083 \
  -e SERVER_PORT=48083 -e SPRING_PROFILES_ACTIVE=local \
  -e ONLYOFFICE_STORAGE_DIR=/app/data/craft \
  -v rfq-craft-documents:/app/data rfq-craft-service:local
```

已创建的容器可用 `docker start rfq-craft-service-local` 重启。存储配置沿用原文件服务的变量名称，但原生编辑器不需要 ONLYOFFICE 容器。旧服务及旧文件卷继续独立保留。

前端：

```sh
cd rfq-react-prototype
npm ci
npm run craft:build
npm run dev -- --port 5174
```

编辑器构建需要 Rust 1.95、WASM target 与 wasm-bindgen 0.2.129；构建脚本会识别本机已缓存工具。固定版本源码、字体及补丁通过散列校验，具体见 [Demo 构建说明](../demos/craft-review/README.md)。`craft:build` 生成 WASM，并将校验后的资源复制到 `public/craft-editors`。后续 `npm run dev` / `npm run build` 的前置步骤只校验、复制已有资源。产物和缓存不入 Git，干净检出需先执行 `craft:build`。

`/api/craft` 默认代理到 `48083`，可用 `RFQ_CRAFT_API_TARGET` 调整；旧文件导入所用 `/api/office` 默认代理到 `48081`，可用 `RFQ_BACKEND_URL` 调整。发布生产构建时，需由部署服务器提供同源 `/api/craft` 路由；开发代理不会打包进静态产物。

## 操作与数据

- 切换右侧条款会定位原文；点击已关联的文件批注会回到对应条款和协作记录。找不到唯一原文时提示核对，不猜测插入位置。
- 「话术批注」在原生 Word / PDF 旁显示本文件各条款的 Comply 或推荐话术，沿用原来的话术生成规则；右侧当前编辑中的条件、原因和结论实时预览。可按结论筛选、点击定位，窄区域中显示在编辑器下方。此处是应答预览，不会自动生成个人协作记录或写入文件批注。
- 点击话术会再次定位并高亮原文，连线使用编辑器返回的真实坐标，随滚动更新；点击已选中的话术也能重新定位。来源不匹配或定位有歧义时不画定位连线。
- 文件中的批注、回复、解决/重开与右侧双向同步。未关联批注显示「待关联条款」，选择有权限的条款后同步。不会把任意文件批注自动归给当前条款。
- SR 可编辑正文；条款处理人可在授权条款批注；只读身份不能新增或修改。外来批注保留原作者，不能改写他人的正文。身份与项目权限仍为演示机制，未接入企业认证。
- 业务协作记录及文件引用仍保存在当前浏览器。真实原件和批阅稿由后端文件卷保存，文件访问凭据随浏览器引用保留。清除浏览器数据会丢失该引用；当前尚无跨设备业务同步。
- 「保存原文」将真实 DOCX / PDF 批阅稿保存到后端。仅在服务器确认且保存内容覆盖当前修改后显示已保存。保存冲突保留本地备份，不覆盖较新版本；先下载备份，再「重开保存稿」。
- 「原件」下载初次上传的文件；「批阅版」下载服务器最新已保存文件。文件正文及未关联批注在重开时以保存稿为准；已进入业务协作记录的待同步批注保留并重新应用。
- 历史 ONLYOFFICE 引用首次使用时导入原件及最新批阅稿，旧引用与文件保留。缺少原件时仍可查看条款摘录，由 SR 补传对应 DOCX / PDF。旧 DOC 须先转换为 DOCX。

文件批阅不会自动重新解析条款、修改应答结论或完成正式审批。当前解析和检索仍沿用原型模拟逻辑；批阅版下载也不等于经评审批准的正式对外导出。

## 验证入口

```sh
cd rfq-react-prototype
npm test
npm run build
```

仓库根目录运行 `node --test demos/craft-review/tests/*.test.mjs` 检查共享批注界面；后端 Docker 构建执行完整 Maven `verify`。原生桥在 Rust 定向测试中验证定位、幂等写入、权限及真实文件保存后重开。

浏览器自动化在当前 Work 设置中关闭，未进行本次浏览器视觉验收。引擎仍是固定版本的上游项目，复杂 Office 排版、PDF 字体和第三方批注应使用实际客户文件补充人工验收。

本次结果和已知检查限制见 [验证记录](prototype-updates/2026-11-01-craft-project-review-verification.md)。
