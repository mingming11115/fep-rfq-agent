# RFQ Desktop Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Approved item11, narrowed by user to desktop only: default60/40, retained resize/fullscreen and annotations below when needed.

**Architecture:** Keep existing ResponsePage Splitter and source components. Parameterize resizePanelShare reset for desktop60 while default55 preserves other consumers. Adjust existing source container threshold only.

**Tech Stack:** React, existing Ant Design Splitter, CSS container query, real React/bridge integration test.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-desktop-workbench-design.md

## Global Constraints

- Desktop60/40, desktop Enter resets60; preserve drag/arrows/minimum widths/fullscreen/session/drafts/permissions/saves.
- Source <=900px stacks annotations below; no new mobile UI, dialog or source presentation state.
- Only own isolated changes; other chat's excerpt/sidebar work in original directory remains intact. One item commit/master merge and authorized master push, no force.

## Review Focus

- Resizing/reset/fullscreen cannot remount editor, save or discard dirty input/current clause.
- Widths near the stacking threshold and expanded mode preserve original and annotation controls.
- Existing navigation, batch, save and permissions remain untouched; cancelled mobile findings cannot enter this desktop commit.

### Task 1: Desktop layout adjustment

**Files:** pages/ResponsePage.jsx, antdAdapters.js, components/craft-source.css, new desktopWorkbench.test.js, guide/spec/plan/verification/screenshots.

**Interfaces:** resizePanelShare accepts optional defaultShare=55; desktop caller supplies60, narrow caller retains55. Existing Splitter/source interfaces unchanged.

- [x] Real ResponsePage test RED: initial/reset ratio60; arrows, fullscreen and unsaved response/native source identity retained, no writes. Run `node --test src/desktopWorkbench.test.js`; expected55 fails.
- [x] Change default share and desktop reset, source stacking threshold. Focused GREEN, full `npm test` and `npm run build` green.
- [x] Verify actual desktop sizing/resize/fullscreen/stacked annotations and capture screenshots. Record prior independent review scope narrowed by user: all findings were cancelled mobile code, excluded entirely; no second review.
- [ ] Commit only item11, merge/test master and push as already requested, then ask item12.

Integration completion is recorded by task-done after the single item commit/master merge, avoiding a bookkeeping commit.
