# RFQ Workflow Actions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this small approved UI change inline.

**Goal:** 按角色突出主流程，将客户澄清与专项评审收进问题处理。
**Architecture:** 保留现有业务处理与权限，在 ResponsePage 调整入口和表单，在 WorkflowPages 对最终审批人默认打开审批页。
**Tech Stack:** React、现有 CSS、Node test runner、浏览器验收。
**Spec:** docs/superpowers/specs/2026-10-26-rfq-workflow-actions-design.md

## Global Constraints

保留当前未提交变更及项目数据；不提交 Git；不新增依赖；不改变审批与确认规则。可逆 UI 调整不增加文案镜像测试，使用现有测试和实际页面交互验证。

## Task 1: 收拢角色操作与问题处理

- [x] 检查当前销售页面，确认同时显示澄清、专业确认、评审及禁用的技术确认按钮。
- [x] 修改 src/pages/ResponsePage.jsx：角色主按钮、默认折叠的问题处理、分开的澄清/评审表单；无事项时隐藏空列表。
- [x] 修改 src/pages/rfq-enhancements.css：操作区与问题菜单样式；修改 src/App.jsx 提交提示文字。
- [x] 修改 src/pages/WorkflowPages.jsx：最终审批人默认进入审批与快照。
- [x] 验证三角色、问题菜单的打开/关闭、两个表单的类型与责任人、普通条款提交至技术确认、已有评审与重新评审入口。
- [x] 运行 npm test、npm run build、git diff --check；保存截图。

## Review Focus

只读任务不出现可操作的问题入口；切换条款后问题菜单关闭；澄清不会展示内部方案批准路线；已提交销售不可重复提交；最终审批人与技术确认权限维持原规则。

## 验证结果

108 项测试通过，构建通过，git diff --check 通过。独立 localhost 项目完成 19 项交互检查；127.0.0.1 用户项目只做查看与页面导航。已有构建体积提示保留。
