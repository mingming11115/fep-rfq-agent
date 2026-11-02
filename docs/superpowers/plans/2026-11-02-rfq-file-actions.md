# RFQ File Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver approved item10: file save/download in a top More menu, distinct file/response save states and preserved keyboard/recovery paths.

**Architecture:** CraftSourcePane owns the controlled file menu and request status, calling the existing editor save and craftClient download APIs. Existing native serialization/persistence and response draft save remain independent. The response editor labels its status explicitly.

**Tech Stack:** React, existing Ant Design Dropdown, existing native message bridge, craftClient, HappyDOM/node:test.

**Spec:** docs/superpowers/specs/2026-11-02-rfq-file-actions-design.md

## Global Constraints

- Only item10. Top “更多” file menu: “保存批阅稿”, “下载原件”, “下载已保存批阅稿”; retain Ctrl/Cmd+S and no bottom row.
- Preserve source/identity isolation and original permissions. No automatic saves, business writes or response confirmation from menu viewing/downloads.
- Disable save when not ready, read-only, excerpt, native request pending or persistence pending. Downloads require loaded metadata; failures remain recoverable.
- Distinct “文件…” and “应答…” save statuses; file failure stays protected until valid server checkpoint covers latest changes. Keep retry/local backup/reopen.
- Existing checkout reused on a codex branch; one item commit/local master merge, preserve unrelated outputs, no push.

## Review Focus

- DOCX and PDF save actions use the real native bridge/queue and correct source/revision; keyboard-origin packets still use that path.
- Read-only, not-ready, excerpt, pending and failed states cannot offer a misleading successful save; stale/newer edits are not marked saved.
- Original and saved-review downloads keep distinct endpoints, access headers/names and do not overwrite or auto-save dirty content.
- Menu keyboard dismissal/focus, native iframe dismissal, view changes and expanded viewport remain usable without remounting the document.
- Failure recovery retains exact latest backup bytes, retry with confirmed revision and unsaved navigation protection; response draft status/save stays independent.

### Task 1: File menu and independent save feedback

**Files:** components/CraftSourcePane.jsx, components/craft-source.css, pages/ResponsePage.jsx; new fileActions.test.js; existing craftSourcePane.test.js/twoMainSections.test.js only where new status labels require adjustments; guide, verification, screenshots.

**Interfaces:** Call editor.current.save() for explicit menu save; existing onSave/queue/onSaved handles persistence and checkpoints. Call downloadCraftFile({...reference,name:meta.name},kind) with kind original/review. Controlled menu open state and native request busy state stay local to CraftSourcePane. Response save status gains aria-label and explicit response wording.

- [x] Write real CraftSourcePane tests for DOCX/PDF menu save/download, explicit endpoints/bytes/revision, pending/error/retry/backup and permissions. Existing real ResponsePage integration verifies independent response status/save. Run `node --test src/fileActions.test.js src/twoMainSections.test.js` in rfq-react-prototype; expect missing More/status behavior to fail.
- [x] Implement menu, guarded save/download requests and file failure status without changing native save/queue. Make response state explicit. Verify menu Esc/focus, iframe dismissal and view changes, with no view writes.
- [x] Run focused suite, `npm test` and `npm run build`; expect green. Browser-check menu, keyboard, expanded viewport and labels without business writes; save screenshots. Obtain one final read-only independent review, fix Important/Critical once via RED→GREEN, ledger rulings/minors.
- [ ] Record verification, commit item10 alone and merge local master. Run task-done with `npm --prefix rfq-react-prototype test` before asking item11.

Evidence: [verification](../../prototype-updates/2026-11-02-file-actions-verification.md). Integration is recorded by task-done after the single item commit and local master merge; no extra bookkeeping commit.
