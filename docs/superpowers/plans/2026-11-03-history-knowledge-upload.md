# History RFQ Knowledge Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 支持历史 RFQ 真实上传、解析和按文档核对／审核条款知识。

**Architecture:** 专用后端解析接口复用原件校验和 DOCX/PDF 读取器，返回文档信息、来源块、条款及异常。前端独立历史 RFQ 页管理本地文档与知识，IndexedDB 保留原件，现有标准回复页保持其维护行为。

**Tech Stack:** Java 17 / Spring Boot 3 / POI / PDFBox；React 19 / Ant Design 5 / Node test / happy-dom。

**Spec:** docs/superpowers/specs/2026-11-03-history-knowledge-upload-design.md

## Global Constraints

- 历史答复包含结论和说明，不新增应答结论字段。
- 原文没有的信息保持空白；缺答复允许保存，不允许提交。
- 同版本不得自审；所有文档、知识和原件访问按 BU／项目隔离。
- 保留当前工作区其它修改；在 codex/rfq-history-upload 分支工作，不提交其它任务改动。
- 不新增解析服务商或依赖；规则抽取不宣传为模型语义解析。

## Review Focus

- 配套答复编号重复或无法对应，不错误绑定到要求。
- 重试不覆盖人工编辑和已审核版本，不重复创建条款。
- 解析失败或浏览器刷新后原件可恢复，存储失败明确提示。
- 文档改为受限范围时，历史知识记录的范围同步收紧。
- 历史现有条款没有文件时可继续查看、维护和独立审批。

### Task 1: 后端真实文件抽取

**Files:** Create `apps/api/src/main/java/com/naura/rfq/history/HistoryExtractor.java`, `HistoryParseController.java`; test `apps/api/src/test/java/com/naura/rfq/history/HistoryParsingTest.java`.

**Interfaces:** POST `/api/rfq/history/parse`, multipart `file`, optional `responseFile`, `buId`; result `{metadata, clauses, sources, issues}`. Clause fields `{key,clauseNo,section,requirement,answer,conditions,evidence,feedback,requirementAnchor,answerAnchor,issues}`; sources `{name,blocks}`. Anchors prefixed `main:` or `answer:`.

- [x] Write tests generating actual DOCX/PDF inputs and checking literal extracted values, errors, permission and cleanup.
- [x] Run backend tests and observe missing feature failures.
- [x] Implement validated upload, deterministic table／paragraph extraction, metadata recognition, safe companion matching and unresolved block reporting.
- [x] Run targeted backend tests, then full backend suite.

### Task 2: 文档与条款状态

**Files:** Create `apps/web/src/historyKnowledge.js`, `historyKnowledge.test.js`, `historyFiles.js`, `historyClient.js`.

**Interfaces:** `mergeHistoryParse(document,result,actor)` preserves source-key identity and edited fields; `historyClauseIssues(clause)`, `filterHistoryDocuments(documents,clauses,query)`, `transitionHistoryClauses(clauses,ids,action,actor)` validate whole-batch permission before transitions. `historyFiles` stores source blobs by BU + document ID. Client starts async parse jobs independent from page mount and writes parse results into existing BU knowledge storage.

- [x] Write tests for retry preservation, companion ordering, missing answer submission, self-review, scope, legacy migration and cross-document search.
- [x] Run `node --test src/historyKnowledge.test.js` and observe failures.
- [x] Implement local persistence and domain transitions, original file retention and authenticated parse client.
- [x] Run domain tests.

### Task 3: 历史 RFQ 页面

**Files:** Create `apps/web/src/pages/HistoryKnowledgePage.jsx`, `history-knowledge.css`, `historyKnowledgeUi.test.js`; modify `App.jsx`, `ReferencePages.jsx` only for integration and legacy entry compatibility.

**Interfaces:** `HistoryKnowledgePage` takes existing common props and renders document table → detail; upload creates async job, detail handles metadata, clauses, selection, review and source panel. Existing `KnowledgePage` routes history type to this page so legacy callers remain supported.

- [x] Add interaction test covering a real rendered upload, pending job navigation, metadata edit, missing-answer repair, selection, submission and independent approval with controlled HTTP responses.
- [x] Run UI test and observe missing feature failure.
- [x] Implement page, original text source panel, inline document metadata and clause edit／review surfaces; preserve legacy history records as metadata-only documents.
- [x] Run new UI test, full `npm test`, `npm run build`.

### Task 4: 端到端验证与说明

**Files:** Update frontend/backend README with true capabilities and prototype persistence boundary; keep QA fixtures and screenshots in `/private/tmp` or `docs/prototype-updates/`.

- [x] Start backend with new classes and existing configuration; verify actual authenticated DOCX upload returns extracted requirements and historical answers.
- [x] Walk browser upload → document detail → edit missing answer → submit; verify responsive layout and original positioning.
- [x] Review diff for BU/project filtering, reparse preservation, failure recovery and changed imports.
- [x] Record verification evidence and report remaining limitations.

## 执行结果

已在当前会话完成。前端 480/480、后端 58/58，生产构建通过。浏览器真实 DOCX 上传、元数据识别、条款补录、重试保留修改和批量提交均已验证。独立审查发现的表头误判、旧记录迁移与范围变化问题已修复并补充回归。用户随后要求提交远程 master；提交仅包含本功能文件和共享文件中本功能的修改，保留其他未提交工作。之前的解析、知识维护和应答面板提交已确认包含于远程 master。详细证据见 `docs/prototype-updates/2026-11-03-history-rfq-verification.md`。
