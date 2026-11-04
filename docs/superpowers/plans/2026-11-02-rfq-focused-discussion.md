# Focused RFQ Discussion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement approved item 6 with current-clause discussion shown immediately and project records collapsed on demand, then commit and merge local master.

**Architecture:** Reuse AnnotationPanel as the default clause discussion in ResponsePage, with the actual source anchor. Wrap ProjectActivityPanel's three record groups in independent native disclosures, keyed by project identity, preserving each group's existing contents and callbacks.

**Tech Stack:** React, HTML details/summary, current CSS and Node/HappyDOM integration tests.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-focused-discussion-design.md

## Global Constraints

- Approved item 6 only. Preserve current-clause permissions/actions, unlinked-file discussion and native editor/save behavior.
- Names remain “协作记录、项目成员、全部批注、操作记录”; no item 7+ changes.
- Disclosures default closed, independent, view-only; update/same-project clause changes preserve open state, project switch resets it.
- Reuse current checkout on codex/rfq-focused-discussion. Preserve unrelated outputs; one item commit and local master merge.

## Review Focus

- Entering collaboration without an active comment must show the actual clause's discussion or empty state, scoped to file/version.
- Cross-clause navigation from project comments must still open the correct discussion and retain historical-version guidance.
- Live record updates and clause changes must not unexpectedly collapse an opened project group; different projects start closed.
- Read-only and empty-requirement views remain usable; opening records must not trigger business writes or file saves.
- Native disclosure controls work by keyboard and fit narrow screens without clipping their labels or counts.

### Task 1: Focused discussion and optional project records

**Files:** ResponsePage.jsx, AnnotationPanel.jsx, ProjectActivityPanel.jsx, rfq-detail.css; new focusedDiscussion.test.js; feature guide, verification note and screenshots.

**Interfaces:** Existing page/annotation props and project record callbacks remain compatible. Native disclosure roots are stable per project, and each summary includes its group label and count.

- [x] Write and run a real ResponsePage regression covering default current discussion without selecting a comment, source scoping, independent disclosure state, project record refresh, cross-clause navigation and zero business writes.
  Run: `node --test src/focusedDiscussion.test.js` in apps/web.
  Expected: FAIL because default current discussion is absent and project records are always expanded.
- [x] Implement unconditional current discussion when no unlinked thread is selected; add independent, accessible record disclosures and small responsive styles.
- [x] Run focused/full frontend tests and production build; verify default, expanded, keyboard and narrow views in the real browser, then independently review. Fix important review findings with regression coverage.
  Run: `npm test`, `npm run build` in apps/web.
  Expected: all pass; existing bundle-size notice may remain.
- [x] Record checks and evidence; independent review allows merge with one deferred minor (historical-route direct coverage).

Final integration gate: commit only item 6, merge local master and rerun tests before asking about item 7. Completion is recorded by the final Git branch state and ignored execution ledger, avoiding a second item commit.
