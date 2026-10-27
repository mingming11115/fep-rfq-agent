# RFQ Process Binding Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Execute inline; one independent final review.

**Goal:** 创建RFQ关联具体工艺，并支持缺项时现场新增机型/工艺。

**Architecture:** 复用机型与工艺领域校验，新增当前BU目录读取及RFQ关联快照函数。独立RFQ创建弹窗负责选择、嵌套新建与回填，App实际创建入口重新读取目录并校验后写项目。

**Tech Stack:** React、现有Modal、localStorage、node:test、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-27-rfq-process-binding-design.md`

## Global Constraints

- 必须关联本BU当前机型的启用工艺。
- SR只能新建，已有配置修改和启停仍归BU管理员。
- 不修改已有RFQ的关联，不增加依赖，保留无关工作区改动。

## Review Focus

- 未选择工艺时只打开弹窗，取消不能创建项目或丢失RFQ表单。
- 跨BU/跨机型/停用工艺不能在提交时混入。
- 新建机型回填后清空旧工艺，嵌套新建保留工艺草稿。
- SR不能借新建接口覆盖、修订或停用原机型和工艺。
- 刷新后关联及目录保持；列表和详情按实际授权显示。

### Task 1: 目录新增权限与项目工艺关联

**Files:** `permissions.js`, `modelProcessDomain.js`, `modelProcessDomain.test.js`, new `rfqProcessBinding.js`, `rfqProcessBinding.test.js`.

**Interfaces:** `readRfqCatalog(storage, context)` returns scoped `{models,processes}`; `resolveRfqProcessBinding({models,processes,modelId,processId,buId})` returns authoritative IDs/labels/versions or throws.

- [x] 写并运行失败测试：SR可新增不能修改、本BU有效关联、缺失/停用/外BU/错误机型拒绝、目录隔离、最新配置快照。
- [x] 实现接口并使领域测试通过。

### Task 2: 创建弹窗与业务集成

**Files:** new `components/CreateRfqDialog.jsx` and CSS; modify `pages/ProjectsPage.jsx`, `App.jsx`, `components/ProjectWorkspace.jsx`, `pages/ReferencePages.jsx`.

- [x] 浏览器先复现旧创建页没有工艺选择的断言失败。
- [x] 实现RFQ表单的选择、缺失时弹窗、新建机型/工艺及回填，保留取消与错误草稿。
- [x] App创建入口校验并写关联快照，详情展示关系，工艺页展示授权RFQ。
- [x] 独立浏览器覆盖已有工艺创建、新建与嵌套弹窗、取消、切换机型、重复编码及权限、BU隔离、刷新持久化。
- [x] 全量测试、构建、差异检查、独立审核并修复。双标签页并发覆盖问题已通过失败复现→修复→浏览器及全量回归。

最终交付：在基于远端master的独立工作区中仅暂存本会话文件，提交并推送；远端提交ID以聊天最终交付记录为准。
