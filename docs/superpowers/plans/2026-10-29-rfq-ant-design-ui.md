# RFQ Ant Design UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the UI migration approved in chat while preserving existing RFQ behavior.

**Architecture:** Adapt the existing presentation layer and callbacks. Reuse Ant components through current facades and small pure adapters; retain business domain modules.

**Tech Stack:** React 19, Vite, compatible Ant Design 5 / ProComponents 2 and the official React 19 patch (registry currently publishes ProComponents 2.8.10 with Ant Design 4/5 peers).

**Spec:** `docs/superpowers/specs/2026-10-29-rfq-ant-design-ui-design.md`

## Global Constraints
- Keep hash navigation, local storage keys and domain callbacks unchanged.
- Personnel choices remain permission-scoped IDs, including unavailable historical selections.
- File selection is manual and persists metadata only; retain replacement reasons and file versions.
- Preserve dirty-navigation guards, annotation anchors and final-review/export gates.
- No backend or notification integration; use scoped CSS and usable narrow layouts.

## Review Focus
- Removing the last upload or rejecting a file must update selected metadata without submitting a request.
- Historical unqualified personnel remain visible and cannot be silently granted qualification.
- Canceling a nested form retains the parent RFQ draft; dates remain ISO calendar strings.
- Splitter resizing must refresh source annotation geometry and preserve scroll/selection.
- Menu and tab navigation must still pass the existing unsaved-edit guard.

### Task 1: Theme and shared presentation adapters
**Files:** package manifests; `src/main.jsx`; `src/antdAdapters.js`; `src/antdAdapters.test.js`; `src/components/ui.jsx`; scoped global CSS.
**Interfaces:** existing Modal/Drawer/StatusBadge/EmptyState/Pagination props remain callable; pure adapters supply ID options, manual upload metadata and valid mention extraction.
- [ ] Add meaningful adapter tests and observe failure before implementation.
- [ ] Install compatible peers, add React 19 patch and ConfigProvider/AntApp.
- [ ] Implement adapters and replace shared controls; verify adapter tests and build.

### Task 2: Lists, RFQ forms, uploads and personnel
**Files:** ProjectsPage, TasksPage, AnalysisRecordsPage, CreateRfqDialog, SourceUploadDialog, PersonPicker, AnnotationPanel; local CSS as necessary.
**Interfaces:** consume Task 1 adapters; retain each existing callback signature and qualified candidate source.
- [ ] Migrate list branches to ProTable, keeping card view and external saved filters.
- [ ] Migrate RFQ creation to ModalForm fields with inline validation; keep nested model/process drafts.
- [ ] Migrate manual upload and personnel selection; add Mentions with final-text ID extraction.
- [ ] Verify browser flows, domain suite and production build.

### Task 3: Workbench and application layout
**Files:** App.jsx; ResponsePage.jsx; ProjectWorkspace.jsx; RFQ and application layout CSS.
**Interfaces:** consume theme and shared controls; preserve navigate(), guardedDetail(), edit() and final-review gate.
- [ ] Introduce ProLayout while retaining roleNavigation and existing navigation callbacks.
- [ ] Introduce Splitter panels, Radio conclusions, readable editing text and responsive layout.
- [ ] Verify dirty navigation, source/annotation alignment, role changes and gated export in browser.

### Task 4: Integrated verification and review
**Files:** README and verification notes; full branch diff.
- [ ] Run full `npm test`, `npm run build` and browser interaction/visual checks.
- [ ] Request one independent whole-change review; resolve material findings and verify fixes.
- [ ] Document user-visible changes and limitations, then leave the reviewed implementation in this branch.
