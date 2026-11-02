# RFQ Unified Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** User-requested commit and master publication of both chats' feature changes.

**Architecture:** Commit staged source changes after original full tests, merge into isolated branch from915ae26, resolve annotation CSS while preserving desktop layout. Native/editor/save/permission contracts remain unchanged.

**Tech Stack:** Existing React/Ant Design/native bridge/tests, git normal merge.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-unified-submission-design.md

## Global Constraints

- Include excerpt removal, unified native/response annotation column and associated tests/docs/screenshot; preserve desktop60/40/default reset/fullscreen.
- No new mobile layout, no unrelated generated outputs, no force-push or discarded concurrent edits.

## Review Focus

- Native and response notes share one column without losing anchors/author/replies/resolve/permissions or persistence.
- Source change/toggle/filter/locate keeps correct row/file and no duplicate/orphaned notes.
- CSS conflict resolution preserves desktop下置/并排 and source readability for both note types.
- Excerpt removal retains missing-original upload guidance and valid save/recovery; native summaries still open correct discussion.

### Task 1: Validate and publish combined features

**Files:** staged13 files in original branch; merged source, bridge, CSS, tests, guide and integration verification.

**Interfaces:** Existing source component contracts plus nativeNotes/nativeActiveId/onOpenNativeComment and externalSummaries; no new backend API.

- [ ] Run original full tests, commit the reviewed staged feature scope; merge into isolated branch and resolve desktop/unified-column CSS conflicts preserving both behaviors.
- [ ] Run combined full tests/build and desktop native/response view checks; one fresh read-only review for this newly included feature scope. Fix important findings once with RED→GREEN if needed.
- [ ] Commit merge/resolution and integration evidence, merge/test/push master; report exact remote acknowledgement and any later concurrent changes remaining.
