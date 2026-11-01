# ONLYOFFICE Source Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在 RFQ 详情左侧打开真实 DOCX/PDF，保存批阅副本并能刷新重开、下载。

**Architecture:** Spring Boot 提供持久化文件、签名会话、保存回调和下载。React 用官方 Docs API 替换默认摘录区；摘录保留辅助入口。沿用用户指定的当前分支和工作区，连续执行，不重复请求已批准设计的实施许可。

**Tech Stack:** React 19 / Vite / Ant Design；Java 17 / Spring Boot 3.5.9；ONLYOFFICE Docs 9.3.1.2；Java 内置 HMAC、HTTP 和 ZIP。

**Spec:** `docs/superpowers/specs/2026-10-30-onlyoffice-source-pane-design.md`

## Global Constraints

- 直接替换详情左侧原文区；保留现有未提交改动和业务数据。
- 先支持 DOCX / PDF；原件不可变，修改保存到批阅副本。
- 仅来源管理 SR 可以写入；其余身份只读。本机演示身份不是生产鉴权。
- JWT 密钥仅在服务端；上传和保存必须真实持久化。
- 不伪造业务批注同步、条款定位、自动解析或审批结果。
- 不修改已有其他项目的文档服务；不对外发布。

## Review Focus

- 切换文件/身份时旧异步响应不能挂载错误文档，旧编辑器销毁。
- 未关联文件的历史示例保留可操作的摘录入口。
- 保存回调失败、重复、过期或越界 URL 不得破坏现有副本。
- 原始文件重启后仍可下载；强制保存不打断当前会话 key。
- 页面“已保存”必须由后端落盘确认，而非编辑器本地修改事件。

### Task 1: 后端文档闭环

**Files:** create `rfq-service/src/main/java/com/naura/rfq/office/{OfficeProperties,OfficeJwt,OfficeFileStore,OfficeDocumentService,OfficeController}.java`; create `rfq-service/src/test/java/com/naura/rfq/office/OfficeIntegrationTest.java`; modify Spring 配置、`.gitignore`、Compose 与环境示例。

**Interfaces:** `/api/office/status`; `POST /documents` multipart；`POST /documents/{id}/session`；`GET /documents/{id}` metadata；`GET /documents/{id}/download?kind=original|review`；`GET /content/{id}?ticket=...`；`POST /callback/{id}`。路径均以 `/api/office` 开头，访问凭据通过 `X-Office-Access` 传入。保存回调返回 ONLYOFFICE 原生 `{error:0}`。

- [x] 写失败测试：真实 DOCX/PDF 上传、错误类型/大小、无凭据拒绝；配置签名和只读权限；状态 2/6 落盘、原件不变、重建 store 恢复、重复回调、旧 key、伪签名和异源 URL。
- [x] 运行 Maven 测试并观察新功能缺失导致失败。
- [x] 实现上述接口；文件使用 UUID 目录及原子写入，状态 6 保留 key，状态 2 结束会话后生成新 key；校验 JWT 和同源回调下载链接，限制 HTTP 超时、大小、重定向。元数据包含副本修订号、保存时间与保存失败状态。
- [x] Maven 完整测试通过后提交后端及其运行配置。

### Task 2: 左侧真实编辑器与上传

**Files:** create `rfq-react-prototype/src/officeClient.js`, `officeClient.test.js`, `components/OnlyOfficeSourcePane.jsx`, `components/onlyoffice-source.css`; modify `SourceUploadDialog.jsx`, `SourceDocumentPane.jsx`, `ResponsePage.jsx`, `App.jsx`, `WorkflowPages.jsx`, `vite.config.js`.

**Interfaces:** `uploadOfficeFile(file, source, signal)` 返回 `{id,access,name,fileType,...}`；`officeRequest(path,ref,options)` 自动附访问凭据；`loadOfficeApi(url)` 复用脚本并支持失败重试；`OnlyOfficeSourcePane` 接收文档引用、来源上下文、写权限、用户、关联原件回调和摘录组件。

- [x] 写失败测试：类型判断、访问凭据不进入 URL、错误响应保留可理解信息；上传保留真实 File 且 localStorage 仅含引用；重试加载脚本；保存状态必须匹配后端 revision。
- [x] 运行 `npm test`，观察新模块缺失导致失败。
- [x] 实现服务端上传和左侧编辑器，缺少原件时可补传；官方实例独立于条款切换，身份/文件变化销毁；保存等待服务端 revision 更新；未保存导航保护；保留只读、摘录、批注历史、分栏和放大。
- [x] `npm test` 及 `npm run build` 通过后提交前端。

### Task 3: 实际浏览器验收与交付

**Files:** update `rfq-service/README.md`, `rfq-react-prototype/README.md`; add `docs/prototype-updates/2026-10-30-onlyoffice-source-pane.md` 和验收截图。

**Interfaces:** 复用任务 1/2 的接口与页面，使用独立测试原件及独立浏览器存储。

- [x] 启动后端、前端和文档服务，DOCX 添加批注/修订并保存，刷新、重开、下载后核对原生 OOXML 内容。
- [x] PDF 标注、保存、重开和下载验证；验证只读身份、缺少原件、服务不可达与摘录入口。
- [x] 运行前后端完整测试和构建，记录实际结果；更新启动说明、集成范围及截图。
- [x] 一次完整分支独立审查，修复重要问题并验证；提交最终代码，保留当前功能分支，不合并或推送。

验收：前端333项、后端17项测试通过；浏览器DOCX原生批注/修订、PDF矩形标注、原生保存、重试保护、只读身份、历史摘录与390px通过。详见 docs/prototype-updates/2026-10-30-onlyoffice-source-pane.md。
