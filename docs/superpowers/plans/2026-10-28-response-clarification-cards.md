# Response Clarification Cards Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved design in this session.

**Goal:** 将已确认的向右滑出叠卡交互接入应答澄清。

**Architecture:** 保留 ResponsePage 的来源栏及保存、权限、版本保护；用队列选择器组织右侧统计筛选与逐条浏览。ReviewsPage 增加卡内呈现方式，继续使用现有业务动作。确认成功后才执行卡片动画并切换。

**Tech Stack:** React 19、现有 CSS、Web Animations API、Node test runner；不增加依赖。

**Spec:** docs/superpowers/specs/2026-10-28-response-clarification-cards-design.md

## Global Constraints

- 左侧原文、基本信息、历史版本、协作记录保留。
- 确认成功向右滑出；评审与澄清在卡内展开。
- 复用现有权限、版本、任务和业务数据；不重置浏览器数据。

## Review Focus

- 当前项因确认退出筛选时，仍在动画结束后切到正确下一项。
- 最后一项、跳过项、无结果和已确认项不会造成重复确认或死循环。
- 保存失败、确认失败或版本冲突不推进卡片。
- reviews 深链接仍定位关联条款，并保留事项权限。
- 卡内表单未保存时切换卡片、筛选或页签必须保护输入。

### Task 1: Queue behavior

**Files:** Create `rfq-react-prototype/src/responseCardQueue.js` and `responseCardQueue.test.js`.

**Interfaces:** `selectResponseCards(requirements,reviews,filters)`, `responseCardStats(requirements,reviews)`, `nextResponseCard(rows,currentId,deferredIds)`, `transitionConfirmedCard({confirm,animate,advance})`.

- [x] Write failing tests for filters, cyclic next selection, empty/confirmed/deferred queues and failed confirmation.
- [x] Implement selectors and ordered confirmation transition; run `node --test src/responseCardQueue.test.js`.

### Task 2: Approved card interface

**Files:** Modify `ResponsePage.jsx`, `AssessmentPanel.jsx`, `WorkflowPages.jsx`; create `pages/response-clarification.css`.

**Interfaces:** Consume Task 1 selectors; reuse existing save/confirm/review callbacks; add `inline` rendering mode to ReviewsPage.

- [x] Integrate statistics and filters, retained tabs, stacked card, direct confirmation, rightward animation and next selection.
- [x] Embed existing issue forms; remove obsolete candidate/discussion surfaces while retaining source annotation navigation through collaboration records.
- [x] Check queue completion, read-only/source conflict, legacy review links and unsaved navigation in the browser.

### Task 3: Validation

**Files:** Same production files and tests; plan records validation.

- [x] Run `npm test` and `npm run build`.
- [x] Verify preserved tabs and source pane, filtering, card inline issues, direct confirmation, rightward motion, failure retention and responsive layout via browser.
- [x] Review the complete diff, fix concrete regressions, and report branch and validation.

## Execution record

- User approved implementation after preview; no additional design approval needed.
- Current checkout starts clean at dd5a154. Work uses codex/rfq-response-clarification-cards in the current checkout so the existing preview tracks changes. No new worktree created.
- Baseline: 223 tests pass.

## Verification result

- 229 Node tests pass, including six new queue/transition/unsaved-navigation cases.
- Production build passes; existing chunk-size warning remains.
- Browser QA uses port 5175 to keep current port 5173 business data unchanged.
- Verified unchanged source layout and four retained tabs, search and empty filters, source target reveal, existing reviews links, in-card issue creation/processing, ordinary and edited confirmation, final-card completion and return, and reduced-width overflow.
- During a confirmed card's exit the observed transform had positive X translation (+337px), followed by the next unfinished card.
- Failed confirmation retains the current saved content. Simultaneous response/issue drafts are protected in sequence; an initially mounted inline review does not leave a stale navigation hook.
- Independent review found three issues: nested navigation guard lifecycle, excluded source targets, and hidden promoted issues. All were corrected using explicit inline guard registration, revealing explicitly selected targets, and opening the response tab for inline matters.
