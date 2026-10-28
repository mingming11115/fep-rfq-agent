# 应答确认与多人评审 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** SR 默认确认，支持显式分派及无批准节点的多人全员评审确认。

**Architecture:** 使用独立确认策略与评审状态转换模块统一权限、任务和页面。评审共享应答及版本，逐人确认绑定应答及评审版本，完成后直接关闭事项并确认应答。

**Tech Stack:** React 19、Vite、Node test runner。

**Spec:** docs/superpowers/specs/2026-10-28-response-review-confirmation-design.md

## Global Constraints
- 整份 RFQ 最终评审保留；专项评审不再出现批准人。
- 保留来源版本保护、项目访问控制及真实身份校验。
- 所有入口一致，修改内容后重新确认同一版本。

## Review Focus
- 旧本机数据及显式分派不能被迁移误覆盖。
- 首位评审人确认后其待办完成，其他评审人的待办保持有效。
- 编辑应答或方案后全部旧确认失效，旧窗口提交不能覆盖新版本。
- 非项目成员、未选中人员及已停用人员不能确认。
- 最终评审与客户澄清仍可正常处理。

### Task 1: 确认策略、状态转换及迁移
**Files:** 新增 src/confirmationPolicy.js、src/reviewDomain.js、src/responseReviewDomain.test.js；修改 permissions.js、personnelDomain.js、taskDomain.js、stateMigration.js。
**Interfaces:** getConfirmationActorIds(state, projectId, row)、getReviewActorIds(review)、hasReviewConfirmation(review, row, actorId)、updateResponseReview(state, input)、resetResponseReviewConfirmations(state, projectId, before, after)。
- [x] 先写并运行测试，覆盖默认 SR、分派、多评审、版本失效、越权及迁移。预期新增场景失败。
- [x] 实现共享策略、状态转换、按人任务及旧数据迁移。
- [x] 运行 Node 全部测试，更新与新业务规则冲突的旧预期。预期全部通过。

### Task 2: 页面与操作边界
**Files:** 修改 App.jsx、ResponsePage.jsx、WorkflowPages.jsx、BuAdminPage.jsx；新增 ResponseReviewPanel.jsx、ReviewerPicker.jsx。
**Interfaces:** 新评审表单提交 reviewerIds；onUpdateReview 接收共享答复及 action=confirm/reopen/assign。
- [x] 将测试中的评审接口接入 App 的实际修改与确认边界。
- [x] 实现多人选人、类别、逐人进度、保存和本人确认，移除旧批准及 SR 提交技术确认入口。
- [x] 更新分派配置及精准提示；运行 npm test、npm run build。预期成功。

### Task 3: 验证与交付
**Files:** 更新本计划进度；使用浏览器验证真实交互。
- [x] 验证 SR 普通确认、双人评审、修改清除确认、项目及待办入口、最终评审。
- [x] 完整回归测试与构建，独立审查变更，修复实际缺陷。
- [x] 记录验证结果，向用户交付。

## 验证结果

- `npm test`：249 项测试全部通过（原有 229 项，新增 20 项行为回归）。
- `npm run build`：成功；保留已有的大包体积提示。
- Chrome 独立测试实例完成 8 个交互场景，页面脚本错误 0。
- 覆盖 SR 默认确认、项目设置直接指派、多人选人、SR 沟通记录、逐人待办、修改清除旧确认、从待办完成最后确认及最终 RFQ 评审入口。
- 独立审查发现的转办、来源更新、旧建议、恢复删除项目、历史归档及旧分派识别问题均已增加回归测试并修复。
- 集成目标：master；用户已明确要求推送远端。
