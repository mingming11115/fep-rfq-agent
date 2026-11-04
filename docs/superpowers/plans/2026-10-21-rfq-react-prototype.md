# RFQ React Interactive Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. User explicitly requested direct implementation; existing PRD and interaction design are the approved implementation inputs.

**Goal:** Deliver all 13 documented pages as a locally served, clickable React prototype.

**Architecture:** A Vite React application with a shared shell and browser-local state. Pure domain functions enforce confirmation, snapshot and export boundaries. Independent page modules implement the document-defined details, forms, drawers and workflows.

**Tech Stack:** React 19, Vite 7, lucide-react, CSS, Node built-in test runner.

**Spec:** `FEP销售RFQ提效Agent_PRD_v0.2.md`, `FEP销售RFQ提效Agent_交互设计_v0.2.md`.

## Global Constraints

- Implement PG-01–06 and PG-08–14; PG-07 is not a separate documented page.
- Use Ant Design Pro query-table layout conventions and Chinese UI.
- Keep customer data synthetic; file processing and model retrieval are explicit simulations.
- Confirmation is separate from matching; changing confirmed content invalidates confirmation.
- Independent final approval binds immutable snapshots; unresolved work prevents formal export.

## Review Focus

- Empty/new projects cannot export a final response.
- Unconfirmed or unimported parsed rows and failed source files remain visible blockers.
- Switching a dirty requirement or page must offer save, discard or cancel.
- Source edits invalidate previous confirmation and snapshot exportability.
- Role changes cannot allow a submitter to approve their own snapshot.

## Tasks

- [x] Implement pure demo data and domain tests; verify red-to-green behavior.
- [x] Implement knowledge, evidence and model capability pages.
- [x] Implement document parsing, reviews and snapshot export pages.
- [x] Create React/Vite scaffold, shared shell, project selection and persistent state.
- [x] Complete response workspace, dashboard and management pages.
- [x] Build, run domain checks and perform browser interaction checks across all pages.
- [x] Start HTTP preview and open the result for the user.

## Verification

- `npm test`: 12 passed, 0 failed, including blank original text, confirmation invalidation, export blockers, immutable snapshot contents and CSV escaping.
- `npm run build`: successful, 1594 modules; Vite reports an advisory for the 529 KB main JavaScript chunk.
- Browser: all 13 navigation entries rendered their expected page heading, with no captured console errors or warnings.
- Browser workflow: created a project, loaded simulated RFQ, selected and imported six requirements, edited/saved a reply, switched to technical confirmation and confirmed a row.
- Browser safeguards: sidebar navigation and browser Back showed the unsaved-change dialog; review drawer closure offered save/discard/cancel; Escape closed only the top dialog.
- Browser export: confirmed count updated to 1/6, unresolved and unimported rows remained blockers, formal export was disabled, and internal CSV draft generation succeeded.
- Browser capability library: both main tabs and manual candidate drawer opened successfully.
- Review fixes: per-project member storage, missing responsibility/final approval checks, route guards and stacked-overlay focus/keyboard handling.
- Restored core demo data after testing; HTTP preview remains running at `http://127.0.0.1:5173/`. Preview screenshot is `apps/web/preview.png`.
