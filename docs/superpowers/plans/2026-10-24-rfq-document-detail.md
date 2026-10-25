# RFQ Document Detail Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these steps inline.

**Goal:** 合并 Word 原文交互与右侧 RFQ 业务表单，形成可体验的两栏详情。

**Architecture:** 保留 ResponsePage 的应答和任务控制，将其升级为详情容器。复用 SettingsPage、ReviewsPage、VersionsPage。SourceDocumentPane 负责 Word 风格原文与范围高亮，统一使用项目批注存储。

**Tech Stack:** React 19、Vite、原生 CSS、Node test runner。

**Spec:** docs/superpowers/specs/2026-10-24-rfq-document-detail-design.md

## Global Constraints

- 不增加依赖；不覆盖当前工作区其他修改。
- 批注锚点包含项目、文件、来源版本和条款；历史批注不静默重挂。
- 切换业务页签保留文档位置；未保存应答继续受现有保护。
- 当前文档预览仍为明确标识的项目条款摘录。

## Review Focus

- 同一段文字重复出现时，范围高亮不得跳到首次出现位置。
- 旧文件版本和其他文件批注不得显示在当前原文。
- 切换项目和文件必须更新正文，空项目保留上传入口。
- 在基本信息、历史版本和评审间切换不得清除应答草稿或绕过权限。
- 1280px 和较窄屏幕中，正文与业务栏均可阅读且不会横向挤出页面。

### Task 1: 原文批注范围

Files: 新增 documentAnnotations.js 与 documentAnnotations.test.js；修改 SourceDocumentPane.jsx、AnnotationPanel.jsx。

- [x] 先写范围、重复文本、重叠批注、旧版本排除测试，运行确认失败。
- [x] 实现 commentTextRange(row, comment)、annotatedSegments(row, comments, activeId)。
- [x] Word 风格正文接入选区和高亮；点击高亮打开右侧批注，批注卡片可定位原文。
- [x] 运行范围测试。

### Task 2: 两栏详情

Files: App.jsx、ProjectWorkspace.jsx、ResponsePage.jsx、新增 rfq-detail.css 与 ProjectActivityPanel.jsx。

- [x] 右栏接入五个业务页签和三个条款处理子页签，目录按需展开。
- [x] 设置、版本和评审路由共用稳定的详情容器；项目详情默认基本信息，继续处理进入条款。
- [x] 减少重复标题和筛选，复用现有处理、保存、确认逻辑。
- [x] 浏览器检查两栏、目录、页签、选择文字、批注保存、刷新、旧版本与空项目。

### Task 3: 验证与交付

- [x] npm test、npm run build、git diff --check。
- [x] 检查浏览器控制台和屏幕效果，保留可查看的预览。
- [x] 进行独立代码审查，修复重要问题，记录结果。

## Progress

- Baseline: 70 tests passing. Existing codex/rfq-project-task-status branch; preview uses current checkout. Other working changes preserved; no automatic commit.
- Task 1 complete: five annotation range tests failed before implementation, then passed.
- Task 2 complete: two-column detail, embedded business panels, optional outline, Word-style source, highlights and connector. Empty-project UI checked on separate localhost origin.
- Task 3 complete: 75 tests passing, Vite build passing, git diff --check clean. Verified 1280px two-column and 700px single-column layouts without horizontal overflow.
- Independent review: four P2 lifecycle issues fixed and browser-verified (discard form restoration, source anchor preservation, comment editing permission, initial deep-link positioning).
- Browser verification also found and fixed comment-card locate using an outdated active ID; locating now keeps the comments tab selected.
- Preview remains on port 5173 in the current checkout. No commits or merges; unrelated working changes preserved.
