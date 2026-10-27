# System Comply Final Review Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the following tasks.

**Goal:** 允许有效的系统推荐Comply条目免逐条确认送评，并在本轮最终评审顶部集中核对。

**Architecture:** 抽取与应答页共用的系统推荐解析及免确认判定；统一提交、批准、导出门禁。快照保存未人工确认清单，发起与审批UI复用突出列表。

**Tech Stack:** React、Node test、Vite、Playwright。

**Spec:** docs/superpowers/specs/2026-10-27-rfq-system-comply-review-design.md

## Global Constraints

- 系统未推荐Comply的条目必须人工点击确认。
- 不能将免逐条确认伪装为人工确认；仍须通过最终评审才可导出。
- 不放开来源变更、证据缺失、未关闭事项及待核对评审建议。
- 沿用当前未提交工作区，保留先前所有调整。

## Review Focus

- 人工改成Comply不能伪造系统推荐。
- 条目源版本或推荐失效后恢复人工检查。
- 提交、最终批准、导出、项目阶段和待办使用相同规则。
- 本轮快照顶部清单固定，不随当前内容变化而变化。
- 审批退回或内容变化仍会锁定正式导出。

### Task 1: 推荐来源与统一门禁

**Files:** `src/responseRecommendation.js`, `src/domain.js`, `src/finalReviewFlow.js`, `src/taskDomain.js`, `src/projectSelectors.js`, relevant tests.

**Interfaces:** `matchingSuggestion(row, projectId)`, `canReviewWithoutManualConfirmation(row, projectId)`, `getUnconfirmedComplyRows(rows, projectId)`; `getExportIssues(rows, reviews, projectId)`; `makeSnapshot` freezes `unconfirmedComplyIds`.

- [x] 先写并运行失败测试：系统推荐Comply可送评、其他结论未确认阻断、人工改Comply不绕过、来源/证据/专项事项检查、快照保留未确认清单、审批后门禁与项目状态/待办一致。
- [x] 实现共享推荐与门禁，不改变人工确认记录；运行完整测试。

### Task 2: 最终评审优先核对

**Files:** `src/pages/ResponsePage.jsx`, `src/pages/WorkflowPages.jsx`, `src/components/UnconfirmedComplyList.jsx`, workflow styles, `src/App.jsx`.

- [x] 发起弹窗顶部列出系统推荐Comply但未点击的条目；非Comply未确认继续显示阻断。
- [x] 审批详情和冻结全文优先显示本轮未人工确认Comply，导出状态准确区分最终批准。
- [x] 浏览器验收：非Comply先阻断→人工确认→未点击Comply仍可发起→顶部列表→双人审批→导出→内容变化重新锁定。
- [x] 完整测试、构建、独立审查、记录结果。

## Execution record

- Native execution in existing checkout; no additional worktree, preserving ongoing changes.

- Task 1 complete：新增规则测试先出现3项预期失败，实现后通过；补充推荐资料版本与源版本检查，总计7项新规则测试。
- Ruling: 日期迁移测试需要必需人工待办，因此3处fixture将req-21/req-26显式设置为matchLevel none；系统推荐Comply现在不再产生这类待办，生产日期规则保持原样。
- Task 2 complete：独立浏览器完整流程通过，真实文件下载与来源变化重锁均通过；截图已保存。
- Verification: 223 tests passed / 0 failures; Vite build passed; git diff --check passed.
- Independent review complete: no actionable findings; reviewer ran 11 targeted tests successfully.
