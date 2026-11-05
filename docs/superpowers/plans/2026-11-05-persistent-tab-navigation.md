# Persistent Tab Navigation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline.

**Goal:** Keep existing workspace tabs mounted across route changes so their native ink bar slides continuously.

**Architecture:** Give related routes a shared layout identity, preserve the layout content node when detail mode changes, and keep project stage navigation visible in detail mode. Business page components continue to change with their routes; identities, BUs and projects remain isolation boundaries.

**Tech Stack:** React 19, Ant Design 5, Vite, Node test runner and happy-dom.

**Spec:** User approved fixing system configuration/audit, knowledge/capabilities and project stage navigation. Existing permissions, source navigation guards, export restrictions and draft protection remain authoritative.

## Review Focus

- A blocked navigation must leave the selected tab unchanged.
- Switching identity, BU or project must not reuse another scope's forms.
- Project detail remains usable at desktop and narrow widths with the stage navigation visible.
- System configuration/audit and knowledge/capabilities must preserve the same ink-bar element.
- Existing detail subsection and statistics tabs continue to function.

## Tasks

- [x] Add failing tests for shared route identities and persistent layout/project tab DOM across detail-mode changes.
- [x] Add route grouping helper and use it for the existing content key; retain a stable content wrapper outside the conditional breadcrumb header.
- [x] Keep project stage tabs visible, selecting the response stage for settings/versions/reviews; keep export disabled conditions.
- [x] Run targeted UI, navigation and draft-protection regression tests and production build.
- [x] In a browser, sample ink-bar positions for all three route groups, check layout and save evidence.

## Execution Notes

Reusing the current checkout: it already contains the authorized tab work and unrelated user changes. No commits or merges requested. No changes to global navigation guards or business permissions.


## Verification

- RED: new tests reproduced missing workspace identity helper, layout remount on detail entry, and project stage navigation disappearing.
- GREEN: 13 navigation, layout, project-stage and detail/draft tests passed; knowledge-group UI regression also passed (14 total). Test runner used --test-force-exit for existing UI timer handles.
- Standard npm run build --prefix apps/web passed, including editor asset preparation and copying.
- Browser: project, knowledge/capabilities and admin/audit tabs kept stable native IDs with 11, 15 and 17 distinct intermediate indicator measurements. Evidence in tests/browser/artifacts/persistent-tabs/.
- At 390px, all three project stages fit inside the viewport; no page horizontal overflow. Temporary viewport override reset.
- Independent narrow code review found no correctness issues; browser verification performed by the implementer.
