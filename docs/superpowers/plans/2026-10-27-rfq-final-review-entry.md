# RFQ Final Review Entry Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在应答处理上下文发起最终评审，并在有效审批通过后解锁导出文档。

**Architecture:** 复用 ExportPage 的快照提交检查与弹窗，通过仅显示发起弹窗的模式嵌入当前项目。增加纯函数门禁，供项目顶部和阶段按钮共用；保持原有逐人评审待办和正式导出校验。

**Tech Stack:** React 19、Vite、Node test、Playwright 浏览器验收。

**Spec:** docs/superpowers/specs/2026-10-27-rfq-final-review-entry-design.md

## Global Constraints

- 沿用当前工作区现有改动，不创建丢失未提交状态的新检出。
- 不新增依赖、后端接口或另一套审批记录。
- 未通过或已失效的审批不得启用「导出文档」。

## Review Focus

- 最新轮次退回时旧批准不得解锁导出。
- 应答、来源、评审人员变化后门禁立即失效。
- 发起弹窗与导出页面使用同一模板、映射和审批范围。
- 待办审批入口不受导出导航门禁阻断。
- 取消弹窗、检查失败与重复发起不得创建额外快照。

### Task 1: 当前项目最终评审门禁

**Files:** Create `rfq-react-prototype/src/finalReviewFlow.js` and `finalReviewFlow.test.js`.

**Interfaces:** `getFinalReviewGate(state, projectId)` returns `{canExport, snapshot, reason}`; consumes current project scope, latest snapshot and SR/technical votes.

- [x] 写测试覆盖未发起、部分通过、全部通过、退回、旧轮次、应答/来源/人员变化以及未关闭事项。
- [x] 运行新测试并确认因缺少门禁行为而失败。
- [x] 实现共享门禁并运行新测试。

### Task 2: 发起弹窗与按钮联动

**Files:** Modify `src/App.jsx`, `src/components/ProjectWorkspace.jsx`, `src/pages/WorkflowPages.jsx` and shared styles as needed.

**Interfaces:** ProjectWorkspace consumes Task 1 gate; ExportPage accepts `launchOnly`, `onClose`, `onSubmitted` to reuse submission UI without navigating first.

- [x] 浏览器先验证应答页缺少发起按钮，记录失败。
- [x] 接入顶部发起按钮、人员/检查弹窗、提交说明和待办跳转。
- [x] 顶部与阶段导出按钮共用门禁，保留待办审批入口；恢复已有模板映射，避免打开页面改变批准范围。
- [x] 浏览器验证取消、检查阻断、双方通过解锁、正式下载、退回和修改重新锁定。
- [x] 运行完整 `npm test`、`npm run build`，记录结果并检查改动。

## Execution record

- Baseline: 212 tests passed, 0 failures.
- Ruling: 直接在当前 checkout 实施；现有未提交改动属于正在运行的原型，新的干净 worktree 无法包含它们。

- Task 1 complete：新增门禁测试先失败（缺少批准后解锁行为），实现后4项通过；完整套件216项通过。
- Task 2 complete：浏览器先复现缺少入口，再验证未确认阻断、取消不提交、技术确认、弹窗发起、双人待办、部分通过不解锁、双方通过解锁、刷新后有效、正式下载、保存修改后重新锁定、重新发起及退回。
- 独立代码审查发现2项P2：launchOnly的映射定位没有导航、同页评审详情无法再次打开。浏览器复现两项失败后修正，再运行完整验收通过；无未处理审查项。
- Final verification：216/216 tests passed；Vite production build passed；git diff --check passed。保留现有打包体积提示（JS chunk >500kB）。
