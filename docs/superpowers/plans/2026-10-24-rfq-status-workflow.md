# RFQ 项目与任务状态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 应用用户确认的五个项目状态、三个任务状态及独立处理结果。

**Architecture:** 保留项目汇总选择器、统一任务协调器及现有 localStorage。文件元数据同步到应用状态；所有卡片及列表共用汇总；任务迁移兼容旧值。

**Tech Stack:** React 19、Vite、Node test runner。

**Spec:** [已确认规则](../specs/2026-10-24-rfq-status-workflow-design.md)

## Global Constraints

- 项目：待上传、解析中、评审中、审批完成、已导出。
- 任务：待处理、处理中、已处理；取消及失效仅作历史。
- 不清空已有项目、答复、批注或历史快照。
- 退回任务已处理，新修改任务待处理；保存不完成任务；查看不改变任务。

## Review Focus

- 新上传及重试后离开解析页，项目状态仍正确。
- 历史导出和当前内容不一致时，不显示已导出。
- 专业及最终审批退回均生成可实际操作的新任务。
- 旧任务迁移后待办计数、已处理列表和处理人不改变。
- 修改任务不能越过身份、对象版本或查看只读限制。

### Task 1: 项目汇总及文件同步

**Files:** Modify `apps/web/src/projectSelectors.js`, `src/snapshotDomain.js`, `src/App.jsx`, `src/pages/WorkflowPages.jsx`; Test `src/projectSelectors.test.js`, `src/snapshotDomain.test.js`。

**Interfaces:** `getProjectSummary(state, projectId, actorId)` 返回新阶段；`state.documentsByProject[projectId]` 为文件元数据数组；`onFilesChange(projectId, files)` 同步独立资料存储。

- [x] 添加并运行失败测试：待上传、解析中、评审中、批准未导出、正式已导出、内容或来源改变。
- [x] 实现五态汇总、资料同步及来源变动校验；运行领域测试。

### Task 2: 任务迁移、结果及退回闭环

**Files:** Modify `src/taskDomain.js`, `src/stateMigration.js`, `src/pages/TasksPage.jsx`, `src/App.jsx`, `src/pages/WorkflowPages.jsx`, `src/components/ui.jsx`；Create `src/taskStatus.js`；Test `src/taskDomain.test.js`, `src/stateMigration.test.js`。路径均相对 `apps/web/`。

**Interfaces:** 任务字段 `status` 为中文标准值、`result` 为独立结果；`startTaskForObject(state, context)` 标记有效保存；退回快照使用 `response-revise` 任务，新快照 `revisionOf` 关联已退回快照。

- [x] 添加并运行失败测试：旧任务迁移、保存继续处理、提交/批准/退回结果、取消不计已处理、最终退回生成可重新提交的修改任务。
- [x] 实现状态迁移、结果记录、退回修改及任务三列展示，同步设计稿和 README。
- [x] 运行 `npm --prefix apps/web test`、`npm --prefix apps/web run build`、`git diff --check`；浏览器核对项目、任务及审批导出状态。
- [x] 复核本次完整差异并修正阻断问题。
