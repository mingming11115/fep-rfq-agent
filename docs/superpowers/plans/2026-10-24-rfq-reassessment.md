# RFQ clause status simplification

User-approved scope: remove 待复核 from current clause states; add 重新评审.

- [x] Merge current and legacy 待复核 into 待确认, retain reason and task responsibility, preserve frozen history.
- [x] Add domain transitions/tests for reopening, archive previous approval, increase version/round and clear active confirmation/approval.
- [x] Connect 重新评审 in clause processing and closed review details, require reason, retain permissions and duplicate prevention.
- [x] Update live status/count labels and verify browser interactions, unit suite, build, diff checks.

Keep the current two-pane detail and all existing working changes. No automatic commit or merge.

Validation: `npm test` passed 81 tests; `npm run build` passed (existing bundle-size warning); `git diff --check` passed. Browser workflow on the separate localhost demo origin verified a confirmed clause starting review, independent approval returning it to 待确认, reopening with a required reason, saving a new-round plan, and preservation of previous submission/approval history. The directory filter exposes only 待确认 / 评审中 / 已确认. User preview data on 127.0.0.1 was not submitted through the test workflow.

Read-only review identified a version-anchor mismatch for clarifications created from confirmed clauses. Added a regression test and bound new matters to the resulting clause version before completing verification.
