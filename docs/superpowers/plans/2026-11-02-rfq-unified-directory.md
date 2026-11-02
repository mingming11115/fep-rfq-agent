# RFQ Unified Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the user-approved single directory with clause and real document-heading views.

**Architecture:** Keep the existing clause controls in a focused directory component. WordCraft exposes a read-only heading catalog and revision-checked navigation through the existing same-origin session bridge; the source pane publishes the current catalog to ResponsePage.

**Tech Stack:** React 19, Ant Design 5, Node test/HappyDOM, pinned WordCraft Rust/WASM.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-unified-directory-design.md

## Global Constraints

- 用户已确认：合并为一个“目录”入口，面板内切换“条款／文档标题”，默认显示条款；条款视图保留处理状态、搜索、筛选、勾选和批量确认。目录只导航，不修改原文。
- 本轮只实现第 1 项，其他精简项目逐项征得用户确认后再实施。
- Preserve the existing uncommitted changes and do not publish or package the application.

## Review Focus

- Stale heading requests after a document edit or source switch must not navigate another destination.
- Read-only users can navigate without writes, dirty flags, revision changes or save requests.
- Missing files, no headings, PDF and loading show honest empty/loading states rather than inferred headings.
- Duplicate heading text remains individually addressable by native structural position.
- Clause filters, checked selections and batch actions survive tab switching.

### Task 1: Read-only native heading catalog and navigation

**Files:** Modify the WordCraft patch and cached `panes/host_review.rs`, `panes/host_project.rs`, `panes/rfq_navigation_tests.rs`; modify `src/craftEditorBridge.js` and its test.

**Interfaces:** Snapshot `headingOutline:{revision,items:[{index,level,text}]}`; bridge `navigateHeading({document,revision,index})`; published `documentOutline:{document,revision,items,supported,ready}`.

- [x] Add native tests for actual headings, duplicate text, read-only navigation and unchanged document/revision/history/dirty; reject stale revisions and sessions.
- [x] Run the native tests and observe the expected failure.
- [x] Implement catalog and guarded navigation; add bridge coverage and run it red to green.
- [x] Regenerate affected patch sections from the fixed source archive, rebuild Word WASM, and verify patch application.

### Task 2: Unified directory UI and integration

**Files:** Create `src/components/RfqDirectory.jsx`, `src/rfqDirectory.test.js`; modify ResponsePage, SourceDocumentPane, CraftSourcePane, rfq-detail.css and source pane tests.

**Interfaces:** `RfqDirectory({children,documentOutline,onNavigateHeading,onClose})`; source-pane prop `onDocumentOutlineChange` publishes a source-scoped catalog and `navigateHeading` callback. The bridge validates session/revision before any navigation.

- [x] Add UI tests for default clause view, tab switching without losing controls, empty/loading/unsupported states and heading clicks; observe failure.
- [x] Implement component and propagate current-source heading state through the source pane; remove duplicate directory button.
- [x] Run focused tests, full frontend suite, build and native navigation tests. Inspect the real local page if browser access is available.
- [x] Record verification and update the feature guide; keep the changes local for this incremental confirmation workflow.

后续：用户已明确授权将统一目录一并合并推送 master 并制作 Windows 资源包，上述“keep local”是实现阶段的历史约束。交付只包含已完成的目录第 1 项，不包含尚待确认的下一项。
