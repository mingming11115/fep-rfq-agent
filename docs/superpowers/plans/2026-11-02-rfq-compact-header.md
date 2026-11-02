# RFQ Compact Document Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved single-line document header, then commit and merge this item to master.

**Architecture:** ResponsePage supplies file-selection and business-action slots to the existing source pane. CraftSourcePane keeps ownership of real file status, excerpt/fullscreen state and editor lifecycle, and contains the unified directory. ResponseCardQuery gains an optional compact trigger while retaining its existing search/filter callbacks.

**Tech Stack:** React 19, Ant Design 5, CSS, Node test/HappyDOM, existing WordCraft bridge.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-compact-header-design.md

## Global Constraints

- Implement item 2 only; later items require individual confirmation.
- File save status must reflect current file persistence, independently of response state.
- Preserve navigation guards and the live editor across toolbar actions.
- User explicitly authorized one commit and merge to master per completed item.

## Review Focus

- Save failures and newer dirty edits must not display a clean file status.
- Directory and search remain accessible while the file pane is expanded.
- Compact search preserves draft filters and uses the existing guarded apply callback.
- Missing/read-only originals and PDF still provide accurate status and valid actions.
- Long filenames and narrow panes keep all controls reachable.

### Task 1: Compact header and search

**Files:** Modify ResponsePage, SourceDocumentPane, CraftSourcePane, ResponseCardFilters and source CSS; extend the source-pane test and add a compact-query interaction test.

**Interfaces:** `toolbar:{fileSelector,actions}` and `directory` slots from ResponsePage to CraftSourcePane; `ResponseCardQuery({compact:true,...existingProps})` opens its existing search/filter controls on demand.

- [x] Verify baseline; extend real source-pane coverage for compact header/save status, fullscreen and unchanged iframe session. Add compact-query interaction coverage and observe expected failures.
- [x] Wire the slots and move the directory inside the file pane; implement compact search with existing callbacks and accessible controls.
- [x] Verify focused tests, full frontend suite, build, real preview including search, directory, fullscreen and header layout; obtain an independent review.
- [x] Update feature guide and verification record, commit this item alone, merge to master and verify the merged tree. Then ask the user to confirm item 3.
