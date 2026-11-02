# RFQ Two Main Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver approved item9: two main response/discussion tabs, project information in a header drawer, and folded reference/evidence in response.

**Architecture:** ProjectWorkspace owns a controlled persistent Drawer receiving the existing SettingsPage panel from App. ResponsePage maps legacy settings routes to response and keeps only response/activity views. AssessmentPanel shows its advice conclusion, with reference/evidence below a native disclosure and the current row's evidence edit field supplied by ResponsePage.

**Tech Stack:** React, installed Ant Design Drawer, native details/summary, existing guards and tests.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-two-main-sections-design.md

## Global Constraints

- Item9 only. Labels “应答／讨论”, header “项目信息”, disclosure “参考与证据”.
- Reuse project fields, permissions and save methods; closing/reopening retains unsaved project edits for the current identity/project. Opening must retain unsaved response edits and the native source session.
- Existing settings route opens the drawer, empty projects remain usable, different projects/identities cannot inherit prior drafts.
- References default closed, reset on clause/source changes and retain state on current-clause updates. Denied/failed candidates stay hidden, manually associated evidence remains available with existing row permissions.
- Preserve review/discussion/navigation/save guards, no implicit business writes. No item10+ or native/persistence changes.
- One item commit and local master merge; preserve unrelated outputs, no remote push.

## Review Focus

- Opening/closing project information preserves both response and settings drafts, and saving still calls the existing authorized callbacks only on explicit save.
- Legacy settings links, empty projects and identity/project changes have correct default views and cannot leak the previous draft.
- Reference disclosure resets only for clause/source changes, preserves typing and supports current evidence links without exposing denied/failed candidate content.
- Two-tab navigation preserves existing dirty/review guards, comment focus and file/version scope; actual App header wiring is present.
- Drawer/disclosure keyboard access, focus return and narrow layout work; source iframe and file save state remain unchanged by view actions.

### Task 1: Two main sections and optional project/reference information

**Files:** App.jsx; components/ProjectWorkspace.jsx, AssessmentPanel.jsx; pages/ManagementPages.jsx, ResponsePage.jsx, rfq-detail.css and rfq-enhancements.css; new twoMainSections.test.js and focusedDiscussion.test.js label update; guide, verification and screenshots.

**Interfaces:** ProjectWorkspace receives projectInfoPanel and retains its children while the controlled drawer closes; SettingsPage gains embedded=false to avoid repeating the page heading in the drawer. AssessmentPanel accepts children for the existing evidence edit field and sourceScope from the effective activeSourceAnchor; its reference disclosure is keyed by project/row/effective source.

- [x] Add real ProjectWorkspace/SettingsPage/ResponsePage integration cases for editable/read-only views: two tabs, header drawer, draft retention, explicit saves, reference scoping and legacy/empty routes. Add denied/failed candidate rendering coverage.
  Run: `node --test src/twoMainSections.test.js` in rfq-react-prototype.
  Expected: FAIL because there are three main tabs and no information drawer.
- [x] Implement controlled drawer and App wiring; map two main views, fold references and provide the current evidence field without bypassing existing edit/save rules. Update discussion-label regression.
- [x] Run focused/full tests and build; browser-check actual header, drawer, reference/discussion, keyboard and narrow views with no business writes; obtain one independent read-only review and fix important findings with RED→GREEN.
  Run: `npm test`, `npm run build` in rfq-react-prototype.
  Expected: green suite/build; existing chunk-size warning may remain.
- [ ] Record evidence, commit item9 alone, merge local master and rerun tests before asking about item10.

Evidence: [verification](../../prototype-updates/2026-11-02-two-sections-verification.md). Integration checkbox remains pending until the task-done gate records the committed local master result in the execution ledger.
