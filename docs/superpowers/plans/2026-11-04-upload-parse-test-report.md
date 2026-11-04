# 上传解析整体检查记录

## 浏览器验收补充（2026-11-04 21:16）

独立 Chrome 会话在前端 5179 页面实际登录 sr01、选择 real-requirement.docx、点击“上传并开始解析”。观察真实上传、Craft 原件保存、parse-runs、requirements 查询均为 HTTP 200。页面状态完成、parsedCount=1；显示原文“1.1 Design pressure shall be 2 MPa.”，条款 REQ-dc205a2f56、文档 DOC-6e446a9184。浏览器断言通过，保存 browser-verified.json、browser-network.json、browser-result.png 于 .local/upload-e2e。独立 MySQL 33307 的对应记录另行 SQL 核对；数据库重启后仍存在。

此前 technical-requirements.docx 在规则模式返回 partial/0 条，未以示例条款替代；最终成功路径使用正文含明确编号要求的独立测试文件。修正旧模拟说明文字，并避免将真实后端 partial 状态因前端自动导入而改成完成。此次验收范围为本地存储与规则解析，不涵盖 MinIO、真实模型/OCR 或任意复杂文件识别率。

## 后续真实全流程验证（2026-11-04 20:49，覆盖此前数据库未验证结论）

磁盘恢复后，在 127.0.0.1:33307 启动独立 MySQL，创建 rfq_upload_e2e，未写业务库。

- UploadParseIntegrationTest 4 项、ProviderPipelineIntegrationTest 3 项通过；包含 DOCX 示例解析、扫描 PDF、重解析不重复、人工修改保护、故障保留旧结果，以及假 HTTP OCR/模型服务与数据库链路。
- DocumentUploadHttpTest 3 项通过（其中 1 项本次新增）：真实 HTTP 登录 → 创建测试项目 → multipart 上传包含正文的 PDF → POST parse-runs → GET requirements → SQL 核对 requirement 数量及 original_text → 下载核对原始字节。另验证上传大小上限和 HEAD/Range。
- 实测 document=DOC-2b7b6f7f93，requirementCount=1，原文包含“300 mm”，解析状态 completed；HTTP 与 SQL 断言均通过。该用例结束后清理测试项目及条款。
- 合计 10 个不同集成用例通过。记录：`.local/upload-e2e/integration.log`、`.local/upload-e2e/http-roundtrip.log`。测试类：DocumentUploadHttpTest.realHttpUploadParseQueryAndDatabaseRoundtrip。
- 本次全流程使用本地文件存储、规则抽取；OCR/模型用例连接本地假服务，不能代表真实供应商或 MinIO 实例联调。页面模拟队列仍未接入后端，此结论不代表浏览器页面端到端通过。

新增 HTTP 用例最初误用了只设置标题的空白 PDF，观察到 partial/0 条，随后改成向页面写入真实要求正文，最终通过；未更改生产解析逻辑。

---

日期：2026-11-04。范围：当前工作区代码、前端回归、后端解析及文件存储测试。未修改业务代码。

## 结论

当前页面到 MySQL 条款表的完整链路未接通，不能判定整体可用。后端具备上传、解析和条款持久化代码，但本次未完成隔离数据库落库集成验证。

## 已通过

- Maven：DocumentStorageTest 5、MinioDocumentStorageTest 5、MinioObjectStoreTest 1、ParsingAdaptersTest 11、HistoryParsingTest 6，共 28 项通过，零失败。HistoryParsingTest 使用 Spring 上下文和现有数据库完成鉴权查询，并非纯单元测试。
- 前端上传相关定向回归：craftClient、craftAssets、craftClauseTargets、historyClient、historyKnowledge、historyVersions、projectDomain，共 30 项通过。
- 编辑器回归：25 项通过。
- 项目布局检查、API 启动脚本测试通过。

## 未通过或未完成

1. 页面接线：SourceUploadDialog 上传原件到 `/api/craft/documents`；App.jsx 的 uploadFromDetail 仅执行 addProjectSources 并提示“模拟解析队列”，没有调用 RFQ 上传及 parse-runs 接口。因此页面完成提示不能证明 requirement 表已写入。
2. 后端落库：ParseService 成功抽取后调用 persistRequirements → RequirementMapper.insert，映射到 requirement 表。该路径有 UploadParseIntegrationTest 测试代码，本次没有重跑：独立 MySQL 初始化报磁盘不足；现有 rfq_app 只有业务库 rfq 权限，未对其执行会新增条款的集成用例。失败初始化所生成的数据目录已清理。
3. 前端全量 npm test：在 genericCatalogUi.test.js 输出通过后持续不退出，已终止本次对应的两个测试进程。后续文件未全部执行，不能称全量通过；已完成输出中无失败行。
4. 默认前端构建：esbuild 报 VirtualAlloc errno=1455 / out of memory。限制 Go 并发和内存的重试亦遇到 PowerShell Stack overflow。未得到构建通过结果。
5. MinIO：mock 存储路由及本地 HTTP SDK 协议测试通过；没有真实 MinIO endpoint/密钥，未做实机联调。

## 证据

- `.local-overall-tests.log`：全量前端测试部分输出。
- `.local-overall-build.log`：默认前端构建失败详情。
- `.local/overall-test/web-targeted.log`：30 项定向回归。
- `.local/overall-test/editors.log`：25 项编辑器回归。
- `.local/overall-test/api-unit.log`、`apps/api/target/surefire-reports`：本次后端结果。

下一步应先将页面上传与后端项目/文档身份、解析接口及条款查询接通，再在隔离 MySQL 库验证上传 → 解析 → requirement 查询。现有存储单测通过不能替代这项验收。
