# RFQ Light Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the light transitions approved in chat without delaying interaction or resetting form state.

**Architecture:** A React layout-effect hook animates existing content references; scope integration to page, list, tab and clause boundaries. Cancel old animations on change/unmount and honor reduced motion.

**Tech Stack:** Existing React 19 and browser Web Animations API; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-rfq-light-transitions-design.md`

## Global Constraints
- Page fade 150ms; local content 120ms; selected colors 100ms.
- Keep stateful DOM and current unsaved-navigation/permission rules.
- No exit wait or animation queue; reduced-motion preference disables the new animation.
- Preserve concurrent edits and the running local checkout; no commit or branch manipulation requested.

## Review Focus
- Rapid navigation ends at the latest clicked destination.
- Editing an input does not restart the animation or remount the form.
- Manual card browsing remains subject to unsaved-edit guards.
- Source annotation geometry is unaffected by opacity-only motion.
- Existing confirmation workflow animation is not replaced or overlapped.

### Task 1: Integrate scoped motion
**Files:** new `src/components/useContentTransition.js`; `RfqAppLayout.jsx`; `ProjectsPage.jsx`; `TasksPage.jsx`; small integration in `ResponsePage.jsx`; `antd-ui.css`.
**Interfaces:** `useContentTransition(ref, transitionKey, { duration=150, enabled=true })` applies a cancellable opacity animation to the existing DOM element when its key changes.
- [x] Confirm the existing direct content replacement and manual card wait.
- [x] Add the hook and wire page/list/tab/card boundaries; shorten manual browsing without changing confirmation actions.
- [x] Verify continuous input and reduced-motion fallback by inspection and browser interaction.

### Task 2: Verify and review
**Files:** current scoped diff and verification record.
- [x] Run full tests, build and whitespace check.
- [x] Browser-check page/list/tab/card switching, rapid actions and dirty-form guard.
- [x] Run one independent scoped review and address material findings.
- [x] Record results and provide the updated local preview.
