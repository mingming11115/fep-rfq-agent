# RFQ Location Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.

**Goal:** Implement item 4's transient success/persistent failure feedback, then commit and merge local master.

**Architecture:** Keep locating in the existing native bridge. CraftSourcePane owns a source/target-scoped 2-second notice and tracks explicit pending locate requests; successful retry resets the notice, unrelated snapshots do not. Move the command to the file toolbar; keep fallback actions in persistent warning feedback.

**Tech Stack:** React, Ant Design, Node test/HappyDOM with controlled notice timers.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-location-feedback-design.md

## Global Constraints

- Approved item 4 only; do not change the native locate algorithm or permissions.
- Navigation/excerpt actions do not modify or save the file or remount its editor.
- Preserve unrelated untracked outputs; commit only this item and merge master.

## Review Focus

- Exactly 2 seconds of success; unrelated snapshots must not extend the timer.
- Repeated explicit successful location restarts feedback even for the same clause.
- A stale result/timer from another clause, file or editor cannot show or clear current success.
- Missing/ambiguous/unsupported/page fallback remains visible with retry/excerpt actions.
- Loading, missing originals and excerpt mode disable the toolbar command; narrow toolbar remains usable.

### Task 1: Location feedback and regression coverage

**Files:** CraftSourcePane.jsx, craft-source.css, craftSourcePane.test.js; feature guide and this item's verification.

**Interfaces:** Existing `editor.locate(id)` result `{id,status}`, snapshot `source:{selectedId,status}`; toolbar accessible name `定位当前条款`.

- [x] Add controlled-clock integration coverage and observe the missing transient behavior fail.
- [x] Implement target-scoped notice, explicit retry lifecycle and toolbar icon; preserve native session and dirty/save state.
- [x] Run focused/full frontend tests and production build; verify success expiry, retry and layout in the real preview; independently review.
- [x] Record checks and browser evidence in the feature guide and verification note.

**Integration gate:** Commit only item 4, integrate it into master and rerun merged tests before asking about item 5. Preserve other work in this shared checkout, including separately committed progress presentation artifacts.
