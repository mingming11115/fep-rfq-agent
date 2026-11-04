# RFQ Craft 文档批阅接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在 RFQ 详情接入已确认的 Word/PDF 界面，并让条款协作记录与真实文件批注双向同步。
**Architecture:** React 宿主共享批注 DOM，原生 iframe 提供排版、锚点和文档写入；Spring Boot 保存文件版本。
**Tech Stack:** React 19 / Vite / Node test / Java 17 Spring Boot / WordCraft 0.13.2 / PdfCraft 0.16.1。
**Spec:** `docs/superpowers/specs/2026-11-01-craft-project-review-design.md`

## Global Constraints

- 只修改新分支，不覆盖其他工作区和已运行服务；演示数据、旧上传文件和业务记录保留。
- 批注必须关联条款才进入协作记录。
- 固定版本和字体校验继续使用现有构建脚本；不依赖独立 Demo 服务器。
- 无浏览器自动化时不绕过设置，不宣称已完成视觉验收。

## Review Focus

- 同一文件切条款、跨文件和跨身份时，旧帧不能修改当前来源。
- 保存未成功或仍在输入时，不能显示全部修改已保存。
- 原生与业务回复来回回传不重复，外来作者和已关联事项不被改写。
- 原生批注丢失、撤销或业务待同步不能误判为已持久化删除。
- 只读及非本人条款不能通过宿主或键盘绕过权限。

### Task 1: 文件保存接口

Files: `apps/api/src/main/java/com/naura/rfq/office/CraftDocumentController.java`,
`OfficeDocumentService.java`, `src/test/java/com/naura/rfq/office/CraftDocumentIntegrationTest.java`。
Interfaces: POST `/api/craft/documents` multipart `file`, optional `review`, source 三元组；
GET metadata/download；PUT `/documents/{id}/review` binary + `If-Match`；使用 `X-Craft-Access`。

- [x] 写并运行失败测试：原件/批阅版独立、导入、未授权、非法格式、旧 revision 冲突、失败保留。
- [x] 实现最小服务和接口，复用现有分版本文件存储与锁。
- [x] 跑后端测试；准备独立端口和存储的可运行后端，不改变旧服务。

### Task 2: 原生项目桥

Files: 两个缓存源码的 host_review/engine 权限入口、Web 启动参数；之后更新固定源码补丁。
Interfaces: 原有 review JSON action 新增 `configure`, `locate`, `upsert`；
`configure` 参数 `{editable,editDocument,targets:[{id,no,quote,page,editable}],selectedId}`。
`locate` 为 `{id}`；`upsert` 为 `{id?,text,author,resolved,quote,clauseId,page?,replies:[{id?,text,author}]}`。
返回 `{id,nativeKey,replies:[{id,nativeKey}]}`；snapshot notes/replies 增加 `nativeKey`，notes 增加 `quote`,`clauseId`；
snapshot `source:{selectedId,status}`。未定位不随意锚定，返回可解释错误。

- [x] 写并运行原生失败测试：定位、只读/批注权限、upsert 幂等及保存重开。
- [x] 实现桥与原生权限保护，现有 Demo 协议仍兼容。
- [x] 定向原生测试和 WASM 构建，更新源码补丁并核对新源码能真正应用。

### Task 3: 业务批注协调器

Files: `apps/web/src/craftCommentSync.js`, `.test.js`。
Interfaces: 纯函数读取来源、条款、业务 comments、native snapshot，输出业务 patch 与原生操作；
业务记录新增 `nativeRef:{documentId,key,engine,revision,state}`，回复分别保留 native key；
保留 `createdBy`,`mentionedUserIds`,`linkedIssues`。未关联不得创建业务记录。

- [x] 失败测试覆盖新增/修改/回复/解决、外来作者、无条款、重放、删除、版本隔离及待保存恢复。
- [x] 实现确定性的协调逻辑和一轮写入抑制，不依赖 React。
- [x] 跑模块及现有前端全套测试。

### Task 4: React 接入和静态资源

Files: `CraftSourcePane.jsx`, `craftClient.js`, `SourceDocumentPane.jsx`, `ResponsePage.jsx`,
共用 DOM 批注的生命周期 API、准备静态资源脚本和 Vite/启动配置。

- [x] 前端桥失败测试：消息来源、旧帧、保存冲突、修改代次、右侧同步、关联条款。
- [x] 共享 Demo 的批注界面和引擎资产；载入真实文件，处理旧引用导入和缺少原件。
- [x] 串联协调器与右侧已有业务回调、原文联动、权限、离开保护、下载和保存确认。
- [x] 保持文件内编辑器实例，取消旧请求并清理 DOM 监听器。
- [x] 更新项目脚本与使用文档；前端测试、DOM 测试、生产构建及 HTTP/保存重开验证。

### Task 5: 验证和交付

- [x] 检查全部改动和关键业务权限，修复重要问题并验证。
- [x] 在独立端口提供可访问的项目详情 Demo，说明未做浏览器视觉验收及上游既有检查告警。
- [x] 更新验证记录，提交当前分支，报告分支、项目入口及实际限制。
