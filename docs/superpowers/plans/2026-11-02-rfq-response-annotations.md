# RFQ Response Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver approved item 7: rename response annotations, default to the current clause, and allow all annotations for the current file on demand.

**Architecture:** Add an optional current-only selection to the existing response annotation model. Native Craft advice owns its view scope; WordAnnotationCanvas opts into focused scope for project excerpts while document processing keeps its current default. Existing file/version component identities reset view state on source changes.

**Tech Stack:** React, existing CSS, Node/HappyDOM real-component integration tests.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-response-annotations-design.md

## Global Constraints

- Approved item 7 only; filters retain five visible conclusion checkboxes until item 8 is confirmed.
- User-facing name: “应答标注”. Scope actions: “查看全部标注／仅看当前条款”. Default: current clause; all = existing rows in the current file.
- Preserve wording, editing preview, navigation/discussion permissions, no automatic save or business write.
- Same-file clause changes preserve scope; new file/version resets current-only. Missing/filtered current clause must not silently show another row.
- Keep document processing's existing default scope; project excerpt explicitly opts in.
- One item commit and local master merge, preserving unrelated outputs. No remote push.

## Review Focus

- Missing selection or a filtered-out current conclusion shows an explicit empty state while the all-annotations action remains usable.
- Current clause changes and unsaved preview updates select the right note without showing stale wording or changing source rows.
- File/version changes reset the view scope, and all annotations remain limited to the current source file.
- Expanding/collapsing annotations preserves the native iframe and makes no business writes or file saves; existing annotation navigation and discussion permissions still apply.
- Native and excerpt controls stay usable on narrow screens and by keyboard; document processing retains its previous scope.

### Task 1: Current-clause annotations with all-file expansion

**Files:** responseAdvice.js; CraftResponseAdvice.jsx, CraftSourcePane.jsx, WordAnnotationCanvas.jsx, SourceDocumentPane.jsx, ResponsePage.jsx; source-response-annotation.css; new responseAnnotationScope.test.js; existing craftSourcePane.test.js accessible-name updates; guide, verification note and screenshots.

**Interfaces:** selectSourceResponseAnnotations gains optional currentOnly=false and activeId; existing callers keep all-row behavior. WordAnnotationCanvas gains focusCurrentAnnotation=false; SourceExcerptPane passes true. Native advice uses current-only unless its scope toggle is expanded. Source identities keep existing file/version remount boundaries.

- [x] Add real component regressions for native and project excerpt paths: selected note only, all-file toggle, current-clause updates, edited preview, filtering/missing selection, source change reset, native iframe identity/no saves, existing menu/discussion boundaries. Protect the default all-row model used by document processing with existing model tests.
  Run: `node --test src/responseAnnotationScope.test.js` in apps/web.
  Expected: FAIL because both existing renderers display all notes by default.
- [x] Add focused selection and scope controls, opt project excerpts in, rename labels, and update existing accessible-name assertions.
- [x] Run focused/full tests and production build; verify native default/all/current controls, clause navigation, excerpt, keyboard and narrow layout in the browser, then obtain one independent read-only review.
  Run: `npm test`, `npm run build` in apps/web.
  Expected: all pass, existing chunk-size notice may remain.
- [x] Record checks/evidence and complete independent review (no remaining findings).

Final integration gate: commit only item 7, merge local master and rerun tests before requesting item 8 confirmation. Final Git state and ignored execution ledger record integration without adding a second item commit.
