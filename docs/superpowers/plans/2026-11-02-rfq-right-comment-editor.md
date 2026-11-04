# RFQ Right Comment Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver approved item 5 with one complete right-side editor and navigable native margin summaries, then commit and merge local master.

**Architecture:** Add an opt-in summary presentation to the shared native comment surface. The existing project bridge resolves explicit native open/edit/new intents to one collaboration record after synchronization; only explicitly requested blank native drafts are imported. ResponsePage routes those intents to AnnotationPanel, retaining the native anchor, permissions and file save lifecycle.

**Tech Stack:** React, Ant Design, existing native message bridge; Node test with HappyDOM and real React/components.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-right-comment-editor-design.md

## Global Constraints

- Approved item 5 only. Right section stays “协作记录”; no native editor or Discord changes.
- Preserve existing edit/reply/resolve/delete permissions, native authors, mentions and promote-to-review.
- Only a freshly requested native comment may use safe unique quote association; existing unlinked notes require explicit association.
- Use current checkout on codex/rfq-right-comment-editor. Preserve unrelated outputs. One item commit, local master integration.

## Review Focus

- A native new/edit event can arrive before collaboration synchronization; it must open the same thread once, keeping its native anchor.
- Ambiguous, empty or out-of-file excerpts must remain unassociated; read-only users must never obtain write controls.
- Native geometry echoes, repeated margin clicks and stale file messages must not reset right-side typing or duplicate records.
- Right-side cancellation/deletion and foreign authors must retain existing ownership rules, mentions and native synchronization.
- Keyboard access, narrow layout and standalone Demo must keep working after project margin fields are removed.

### Task 1: One right-side editor with native margin summaries

**Files:**
- Modify: packages/craft-editors/site/original-comments.js, original-comments.css
- Modify: apps/web/src/craftEditorBridge.js, craftCommentSync.js
- Modify: apps/web/src/components/AnnotationPanel.jsx, CraftSourcePane.jsx, SourceDocumentPane.jsx
- Create: apps/web/src/components/UnlinkedCommentPanel.jsx (right-side real file thread before clause association)
- Modify: apps/web/src/pages/ResponsePage.jsx
- Test: apps/web/src/craftEditorBridge.test.js, craftCommentSync.test.js; new annotationPanel.test.js; shared original-comments tests
- Docs: feature guide and item 5 verification record/screenshots

**Interfaces:** `createOriginalComments({summaryOnly=false,onSelect(id,note,{edit,newComment})})`; `createCraftProjectEditor.onSelectComment(id,anchor,{edit})`; `mergeNativeComments({draftNativeKeys=[]})`; `AnnotationPanel({editRequest,canManage})`.

- [x] Write failing integration tests for margin summary routing, explicit native blank drafts/unique association, ambiguity/read-only/stale messages and right-side editing/permissions. Preserve existing standalone surface tests.
  Run: `node --test src/craftEditorBridge.test.js src/craftCommentSync.test.js src/annotationPanel.test.js` in apps/web.
  Expected: new assertions fail because project margin still edits inline and lacks right-side edit intent.
- [x] Implement optional margin summaries, explicit draft routing after native merge, and right-side edit/delete/cancel behavior; propagate intent through the existing page without remounting the native editor.
- [x] Run focused tests, complete frontend suite, shared comment surface suite and production build.
  Run: `npm test`, `node --test packages/craft-editors/tests/*.test.mjs` from repo root for shared suite, `npm run build` from frontend.
  Expected: all pass; existing bundle-size notices may remain.
- [x] Verify real browser new comment, margin click, right edit/reply/resolve/cancel and narrow layout with disposable demonstration data, then restore test-created content. Independently review against the spec and Review Focus; fix important findings with red-to-green coverage.
- [x] Update guide and verification record.

**Integration gate:** Commit item 5 alone, merge master and rerun frontend tests on the merged tree before confirming item 6.
