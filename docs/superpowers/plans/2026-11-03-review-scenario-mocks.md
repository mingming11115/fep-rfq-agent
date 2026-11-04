# RFQ Review Scenario Mocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three independent RFQ demo projects for partial clause review, readiness for final review, and approved final review.

**Architecture:** A pure scenario initializer appends synthetic projects without rewriting existing state. A transactional storage wrapper backs up and persists additions; App startup and reset reuse the initializer after existing demo cleanup.

**Tech Stack:** Existing React application, JavaScript domain modules, node:test.

**Spec:** docs/superpowers/specs/2026-11-03-review-scenario-mocks-design.md

## Global Constraints

- Preserve existing projects, approvals, manual edits, deletions, actor selection, and other BUs.
- Use eligible BU-DEMO personnel and the existing confirmation and final-review policies.
- Mark project names, answers, evidence, and synthetic approvals as mock data.
- Do not change project lifecycle stages or weaken submission/export checks.
- Reuse the active checkout; leave changes reviewable without an unsolicited commit.

## Review Focus

- Previously completed RFQ-001 approval remains unchanged.
- Repeated startup does not replace edited or deleted demos.
- An existing project with a reserved demo ID is not overwritten.
- Synthetic approval fingerprints match the actual ExportPage scope.
- Storage failures do not leave partially added project caches.

### Task 1: Append and persist valid review scenarios

**Files:** Create `apps/web/src/demoReviewScenarios.js`, `apps/web/src/demoReviewScenarios.test.js`; modify `apps/web/src/App.jsx` and the prototype README.

**Interfaces:** `addReviewScenarioDemos(state, {at}?)` returns original or augmented state; `addStoredReviewScenarioDemos(storage, state, {at}?)` backs up and persists additions atomically.

- [x] Write behavior tests for the three scenarios, tasks, valid export scope, preservation, idempotence, BU isolation, collisions, deletion and storage rollback.
- [x] Run the new test and observe failure because the initializer does not exist.
- [x] Implement the initializer and storage wrapper using the existing domain helpers.
- [x] Wire startup and reset after existing cleanup; document the three cases.
- [x] Run the new tests, full test suite and production build.
- [x] Reload the real browser, inspect the cases and verify the existing completed approval is retained.
- [x] Obtain one read-only code review and resolve material findings. Review completed with no material findings.
