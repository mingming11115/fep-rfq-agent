# RFQ Editor Tools Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.

**Goal:** Hide the hosted Word ribbon by default; provide a view-only host toggle; commit and merge item 3 to master.

**Architecture:** The pinned WordCraft host bridge stores per-document toolbar visibility independently of document content/permissions. Ribbon rendering exits without reserving space when controlled and hidden. A startup query enables this mode before first paint; configure messages preserve manual choices. The existing React file toolbar exposes the native state and toggle.

**Tech Stack:** Rust/egui/WASM, React 19, Ant Design 5, Node/HappyDOM tests.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-editor-tools-design.md

## Global Constraints

- Item 3 only; later items still require confirmation.
- Toggle changes no content, permissions, dirty flag, revision, undo history or file persistence.
- Existing hidden tabs stay hidden; standalone Demo/PDF preserve their existing behavior.
- Commit this item independently and merge local master after checks.

## Review Focus

- First paint and new files hide the ribbon despite old preferences.
- Reconfiguration preserves an explicit open/closed choice.
- Full-width and narrow render paths reserve no hidden ribbon space.
- Read-only permissions stay enforced when tools are shown.
- PDF/excerpt and a stale or destroyed bridge cannot apply Word tool changes.

### Task 1: Native visibility control and host switch

**Files:** WordCraft patch/source `panes/host_project.rs`, `panes/host_review.rs`, `ribbon.rs`, `ribbon/rfq_tests.rs`, `apps/wordcraft-web/src/web.rs`; frontend bridge/source pane and their tests/CSS.

**Interfaces:** Native `externalTools` configuration, `tools({visible})` command, `editorToolsControlled`/`editorToolsVisible` snapshot; bridge `setEditorTools(visible)` and matching state.

- [x] Add meaningful native and bridge/source-pane regressions; observe failures for the missing view control.
- [x] Implement view-only state, startup default and accessible toolbar switch; preserve editor identity and permissions.
- [x] Reapply the pinned-source patch, rebuild WASM, run native host/ribbon checks, frontend suite and production build, and browser-check hidden/expanded modes.
- [x] Independently review and fix material findings; record verification, commit this item and merge master; verify merged tests before asking about item 4.
