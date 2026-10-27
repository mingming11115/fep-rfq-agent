# RFQ Source Response Annotations Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline. Steps use checkbox syntax for tracking.

**Goal:** RFQ 解析后，在条款原文旁显示 Comply 或对应推荐话术。

**Architecture:** 在 responseAdvice.js 派生只读标注模型，以共享 WordAnnotationCanvas 同时接入解析页和应答原文。直接与历史示例共用 public/word-comments.css，以独立批注栏、正文高亮、同色折线和避让布局实现原 Word 样式。解析快照与当前应答通过条款 ID 对齐，详情页支持当前编辑预览。

**Tech Stack:** React 19、Vite、Node test、Playwright 浏览器验收；无需新增依赖。

**Spec:** docs/superpowers/specs/2026-10-26-rfq-source-response-annotations-design.md

## Global Constraints

- 明确的 Comply 在原 Word 样式批注内显示 Comply；有条件 Comply、不满足、不适用、待确认显示现有规则生成的推荐话术。
- 标注不会自行保存、采用草稿、确认条款或改变审批。
- 当前解析仍为已有模拟流程，本次不扩展真实 Word 读取或 DOCX 导出。

## Review Focus

- 有条件 Comply 不得被当成无条件 Comply。
- 解析快照为旧结论时，展示当前已保存结论和条件。
- 缺失结论时展示待确认推荐话术，不作满足承诺。
- 编辑当前条款时只预览该条，保持正文和已保存草稿不变。
- 窄屏、长话术及隐藏标注不得遮挡原文或破坏文字选区批注。

## Task 1: Shared annotation model and both original views

**Files:** responseAdvice.js / responseAdvice.test.js；components/WordAnnotationCanvas.jsx / SourceResponseAnnotation.jsx / source-response-annotation.css；public/word-comments.html / word-comments.css；components/SourceDocumentPane.jsx / DocumentWorkbench.jsx / document-workbench.css；pages/ResponsePage.jsx / WorkflowPages.jsx；README.md。

**Interfaces:** `buildSourceResponseAnnotation(row={}, response=row)` returns `{kind, label, conclusion, wording}`. `WordAnnotationCanvas({rows,responseRows,responsePreview,activeId,...})` resolves models, highlights and note positions; `SourceResponseAnnotation({row,annotation,color,active,...})` displays a Word note. DocumentWorkbench receives `responseRows`; SourceDocumentPane receives `responsePreview`.

- [x] Write failing tests for exact Comply, all other conclusions, missing conclusion, latest response overriding parsed fields, and input immutability. Run `node --test src/responseAdvice.test.js`; expect the new behavior tests to fail.
- [x] Implement the display model and shared component. Add per-clause side annotations to both views and default “显示标注” on. Keep source text, anchors and saved drafts intact.
- [x] Run `npm test` and `npm run build`; expect all tests and production build to pass.
- [x] In an isolated browser context, verify both views, default display, conditional/noncompliant wording, editing preview, saved-response synchronization, hide/show, original selection comments, reload and narrow layouts. Capture screenshots and check console errors.
- [x] Update README and review the final diff. Leave the reviewable change in the current checkout without merging or publishing.

## Validation

- Four new behavior tests failed before implementation. Final Node suite: 155/155 passing. Production Vite build passed; existing bundle-size warning remains.
- Isolated Chrome QA passed both views, every conclusion branch, default/hide/show, unsaved preview, saved-response precedence, preservation of original text and manual draft, exact selected-text comment anchors, reload and viewport widths 1600/1440/1100/900/760/390. It compared actual note font/background/borders with the original Word demo, verified matching highlight/connector colors, navigation, formatting, zoom, long-note collision avoidance, and historical example editing/reply/persistence. No page runtime errors.
- Independent read-only review found no Critical, Important or Minor issues; independently reran all 17 response-advice tests successfully.
- Screenshot: docs/prototype-updates/2026-10-27-source-response-annotations.png.
