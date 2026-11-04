# RFQ Annotation Filter Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver approved item 8 with compact conclusion filter menus in native and project excerpt annotation views.

**Architecture:** Shared ResponseAnnotationFilter controls an existing array of selected conclusions through onChange. Each renderer retains its existing filtering state/model. Popover supplies click-outside handling, and explicit Escape/focus behavior keeps keyboard navigation usable.

**Tech Stack:** React, installed Ant Design Popover, existing CSS, real SourceDocumentPane HappyDOM integration tests.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-annotation-filter-menu-design.md

## Global Constraints

- Item 8 only. Default label “全部结论”; subsets including empty show “已选 N 类”. Five existing conclusions, immediate multi-select, “全选／清空”.
- Menus preserve choices after closing and within the source session; source changes retain existing reset behavior.
- Native and project excerpt use compact controls; document processing keeps its existing inline filter layout.
- Preserve annotation scope, previews, native iframe, source navigation/permissions and persistence. No new business writes or file saves.
- One item commit/local master merge, no remote push; preserve unrelated outputs.

## Review Focus

- Clear/all and partial multi-select update the actual visible notes, preserve choices across close/reopen and coexist with current/all scope.
- Keyboard opening, checkbox operation and Escape return focus correctly, without interfering with document editor shortcuts.
- Popup remains readable and clickable in narrow panes and above the expanded file view, without container clipping.
- Disabled/hidden annotation views or a changed file do not leave an active stale popup; new sources retain expected default selection.
- Existing preview/permission/navigation behavior and document processing inline filters remain intact; menu actions do not save files or alter business data.

### Task 1: Shared compact conclusion menu

**Files:** new components/ResponseAnnotationFilter.jsx and annotationFilterView.js; components/CraftResponseAdvice.jsx, CraftSourcePane.jsx, WordAnnotationCanvas.jsx, craft-source.css, source-response-annotation.css; responseAnnotationScope.test.js, craftSourcePane.test.js fixture globals; guide, verification and screenshots.

**Interfaces:** ResponseAnnotationFilter({value,onChange,disabled=false,editorFrame}) consumes the existing conclusion array, emits new arrays, and owns only popup state. AnnotationFilterView supplies native/excerpt visibility; hidden owners close their portals while preserving selections. Optional editorFrame provides same-origin pointer/focus/load dismissal without consuming editor events. WordAnnotationCanvas enables compact filters only when focusCurrentAnnotation is true.

- [x] Extend real native/excerpt regressions: no inline checkboxes when closed; trigger summary; popup five options; clear, partial selection, all; reopen persistence; Escape focus; existing scope/preview/source reset and no saves remain covered.
  Run: `node --test src/responseAnnotationScope.test.js` in apps/web.
  Expected: FAIL because no compact trigger exists.
- [x] Implement the shared popup, integrate the two project renderers, and add compact responsive styles. Reuse installed Popover's controlled open, afterOpenChange and destroyOnHidden APIs.
- [x] Run focused/full tests and build, then browser-check native/excerpt, keyboard/outside dismissal, empty/all/subsets, expanded and narrow views. Obtain one fresh read-only review; fix important findings with regression coverage.
  Run: `npm test`, `npm run build` in apps/web.
  Expected: green suite/build, existing chunk-size notice may remain.
- [x] Record evidence; two Important dismissal findings fixed in one RED→GREEN pass, no deferred minors.

Final integration gate: commit only item8, merge local master and rerun tests before requesting item9 confirmation. Final Git state and ignored execution ledger record integration without a second item commit.
