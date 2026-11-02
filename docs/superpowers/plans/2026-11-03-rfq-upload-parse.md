# RFQ upload and parse implementation plan

**Goal:** 完成可配置模型/OCR与独立降级、上传校验与原件下载。
**Architecture:** 原生读取器产生带识别状态内容块；HTTP 适配器与混合抽取器返回结果及警告；ParseService 在成功抽取后原子替换并记录实际运行信息。
**Tech Stack:** Java 17, Spring Boot, MyBatis, POI, PDFBox, JUnit.
**Spec:** ../specs/2026-11-03-rfq-upload-parse-design.md

## Constraints and review focus

不动已有前端改动；使用当前 checkout；不提交密钥、不自动提交或推送。关注模型幻觉、批次失败、混合扫描内容、人工修改和并发重解析、文件及数据库失败的一致性。

### Task 1: Upload
- [x] 写校验伪造扩展名、原件 SHA 和授权下载的测试，运行确认失败。
- [x] 修改 DocumentStorage / DocumentController，增加上传校验、失败清理、下载。
- [x] 运行上传测试。

### Task 2: HTTP extraction and OCR
- [x] 写 HTTP 假服务测试：模型成功、关闭、HTTP 错误、超时、JSON 错误、引用错误、批次覆盖；OCR 成功和不可用。
- [x] 实现 ParseIntegrationProperties、受限 HTTP 客户端、HybridRequirementExtractor、OcrClient；扩展 RawBlock 和读取器，保留图片锚点及识别状态。
- [x] 运行解析单元测试。

### Task 3: Persistence and delivery
- [x] 写 ParseService 集成测试：完整上传解析查询、扫描缺失 partial、失败保留旧条款、拒绝覆盖人工结果。
- [x] 更新服务、Mapper、迁移及环境配置；更新 README 接口协议和示例。
- [x] 运行 Maven verify、审阅 diff，修复发现的问题，记录结果。

## Verification record

- RED: `ParsingAdaptersTest` 缺少适配器；集成测试复现 extractor 不持久化及 OCR 占位无异常计数。
- GREEN: 上传/解析服务及集成测试通过；本地 HTTP 服务验证 OCR → 模型 → 数据库，模型/OCR 各自故障降级。
- 独立代码审查发现三项 P2：块内摘录遗漏、HTTP 请求没有整体时限、PDF 内联图片遗漏。新增三个回归测试分别观察失败，再修复为完整原文覆盖、可取消的异步请求总时限、PDF 图形流图片遍历。
- 最终 Maven `verify`: 52 tests, 0 failures, 0 errors, BUILD SUCCESS。使用 Docker Maven/JDK17，独立 `rfq_parse_test` MySQL 库，不写现有业务库。
- 白盒边界：模型响应通过来源及覆盖校验仍需人工语义核对；HTTP OCR 为本文定义的协议，尚无供应商实网联调；解析为同步接口。
- 当前 checkout 含用户已有前端工作，按桌面规则复用并只修改后端；不自动提交、推送或更新历史分发包。验证 JAR 复制至 `rfq-service/target/rfq-service.jar`。
