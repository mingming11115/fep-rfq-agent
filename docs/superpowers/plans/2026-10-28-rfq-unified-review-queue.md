# RFQ Unified Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 合并应答和评审澄清，并提供确认后的顺序处理与可见反馈。
**Architecture:** 纯函数负责队列筛选、计数、下一项和路由；独立组件负责清单和事项摘要，ResponsePage 复用原有业务回调与抽屉。
**Tech Stack:** React 19、现有 CSS、Lucide、Node test、Vite。
**Spec:** docs/superpowers/specs/2026-10-28-rfq-unified-review-queue-design.md

## Global Constraints
- 保留权限、版本检查、确认原因、未保存保护和导出门禁。
- 不引入新依赖，不重置本机业务数据；旧评审待办链接可用。

## Review Focus
- 跨对象下一条不得携带旧任务、旧来源版本或旧评审ID。
- 空队列、无本人事项和最后一条不得回落到错误条款。
- 同一条款多个事项的统计按条款去重；事项总数单独展示。
- 失败或重复提交不得前进，也不得绕开评审／澄清阻断。
- 草稿切换、评审建议采用、窄屏布局及旧待办链接应可继续使用。

### Task 1: Queue behavior
**Files:** `rfq-react-prototype/src/responseQueue.js`, `src/responseQueue.test.js`。
**Interfaces:** `selectResponseQueue(rows,reviews,options)`, `responseQueueCounts(rows,reviews,options)`, `nextResponseRequirement(rows,currentId,options)`, `responseQueueRoute(row)`。
- [x] 添加顺序、单次回找、过滤权限、提交排除、空队列、事项去重、路由清理测试并观察失败。
- [x] 实现辅助函数并验证测试通过。

### Task 2: Unified workbench
**Files:** `src/components/ResponseQueue.jsx`, `src/pages/ResponsePage.jsx`, `src/pages/WorkflowPages.jsx`, `src/pages/unified-response.css`。
- [x] 添加队列与条款事项摘要，删除重复tab，增加项目事项入口，旧评审路由映射到统一处理。
- [x] 复用确认和提交回调，一键处理有效应答、记录反馈、同步来源和下一对象路由；保留修改确认弹窗。
- [x] 集成保留未保存保护的评审列表选择回调；优化宽屏三栏与窄屏清单。
- [x] 运行全量测试和构建。

### Task 3: Browser verification and review
- [x] 隔离浏览器存储验证真实确认／提交、任务深链、阻断、返回反馈、评审抽屉、刷新与窄屏。
- [x] 独立代码审查，修正重要问题；记录验证并打开本地页面。

## Execution ledger
- 2026-10-28：用户要求直接修改，当前干净工作区创建 `codex/rfq-unified-review-queue`；基线223/223。采用当前会话实施，不再请求设计或执行方式确认。

- 完成：队列10项测试、全量233项测试、Vite构建和浏览器交互均通过。独立审查P2已按RED→GREEN修正并回归。保留本地分支供体验，未推送或合并。
