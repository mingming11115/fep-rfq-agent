# BU final review and catalog controls

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks in the existing prototype checkout. The user's current request and clarification are the spec.

**Goal:** Configure existing final-review modes from BU management, rename BU navigation, and edit/delete catalog nodes directly with confirmation.

**Architecture:** Save the existing `all` / `representative` rule together with the project's reviewers. Keep snapshot validation and the existing required-reviewer logic. Add optional catalog tree actions and a BU-scoped deletion boundary that reads current storage before removing a node and its children.

**Tech Stack:** React, localStorage, Node test runner, Vite.

**Spec:** User request in this chat, clarified to reuse the existing review-rule dropdown.

## Global Constraints

- Rename “项目授权与评审分派” to “最终评审配置”.
- Reuse “技术组全员通过” / “指定技术负责人代表通过”; SR approval remains required.
- Rename BU “知识库审核” to “知识管理” and “BU审计记录” to “审计记录”.
- Remove the model form's source field and specified instructional copy; remove the hierarchy subtitle.
- Catalog edits reuse existing forms and version behavior; deleting requires a modal confirmation.
- Preserve unrelated BU records, existing RFQ project metadata, and the user's unrelated pending changes.

## Review Focus

- Changing one project's mode must not change other projects or silently reuse existing approvals.
- Representative mode requires a selected, eligible group representative.
- Deleting a filtered parent must also remove its hidden children without affecting other BUs.
- Cancelled deletion and failed storage writes must leave the catalog intact.
- Tree actions must work on a non-selected node and remain keyboard accessible.

### Task 1: Final-review configuration and BU naming

**Files:** `personnelDomain.js`, `projectReviewSettings.test.js`, `pages/BuAdminPage.jsx`, `permissions.js`, `pages/BuDashboardPage.jsx` under `rfq-react-prototype/src`.

- [ ] Add tests for changing a project's mode with its reviewer configuration, validation, isolation, and snapshot invalidation; run RED.
- [ ] Extend `configureProjectFinalReviewers` with optional `technicalMode`; retain the saved mode when omitted and increase its version only when changed.
- [ ] Add the existing rule dropdown and representative picker to the configuration form; rename the specified labels.
- [ ] Run targeted tests and browser checks.

### Task 2: Catalog editing and deletion

**Files:** `modelProcessDomain.js`, `modelProcessDomain.test.js`, `rfqProcessBinding.js`, `rfqProcessBinding.test.js`, `components/CapabilityTree.jsx`, `components/capability-tree.css`, `pages/ReferencePages.jsx` under `rfq-react-prototype/src`.

- [ ] Add tests for model/process cascade deletion, single capability-version deletion, BU isolation, unauthorized deletion, fresh storage reads, empty catalogs, and write rollback; run RED.
- [ ] Implement `removeCatalogNode(catalog, {context,kind,id,version})` and `deleteRfqCatalogRecord(storage, context, kind, record)`; persist all affected records while preserving foreign BU entries.
- [ ] Add optional `renderActions(node)` to the tree, reuse the correct node's editing form, and add a deletion confirmation modal.
- [ ] Remove the requested model fields and copy; ensure deleted capability storage refreshes before the next render.
- [ ] Run targeted tests and browser checks for non-selected nodes, cancel/confirm, reload persistence, and read-only roles.

### Task 3: Verification and review

- [ ] Run `npm test`, `npm run build`, browser regression, and `git diff --check`.
- [ ] Review the bounded diff independently; fix substantive findings and repeat affected checks.

## Execution notes

- Continue in the same checkout as the already authorized prototype updates, preserving the three pre-existing modified files (README and demo cleanup).
- No commit, merge, push, or deployment is required by this request.
