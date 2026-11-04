# BU 看板 Implementation Plan

> 执行方式：当前会话直接实施，用户已回复“先做吧”。

**Goal:** 为 BU 管理员提供可筛选、可切换 BU 的业务进度看板。

**Architecture:** 新增只返回管理概览的 BU 汇总选择器和角色专属看板，接入已有 dashboard 路由。复用项目阶段、任务状态和管理授权。

**Tech Stack:** React 19、Vite 7、Node 内置测试，不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-27-rfq-bu-dashboard-design.md`

## Global Constraints

- 沿用 React、Vite 和本机状态，不增加依赖。
- 不返回条款原文、应答正文、证据或快照。
- 管理身份仍不能直接处理业务任务或打开未授权项目原文。
- 保留工作区现有 selection-qa 文件。

## Review Focus

- 跨 BU 和撤销管理资格后禁止读取汇总。
- 截止日按北京时间当天结束计算，已导出不算逾期。
- 排除已完成、取消、失效任务及失效确认。
- 空 BU 和空搜索结果保持可操作，不出现 NaN。
- BU 切换和管理入口保持当前 BU，个人工作台保留。

### Task 1: 汇总选择器

**Files:** 新增 `apps/web/src/buDashboardSelectors.js` 和同名 `.test.js`。

**Interfaces:** `selectBuDashboard(state, {actorId, buId, now})` 返回授权 BU 的项目概览、统计、阶段分布、任务分布和人员负荷；未授权返回 null。

- [x] 先写并运行失败测试：授权隔离、任务状态、确认口径、空 BU、截止日、当前项目状态。
- [x] 实现汇总，运行新增测试直至通过。

### Task 2: 角色看板与入口

**Files:** 新增 `pages/BuDashboardPage.jsx`、`pages/bu-dashboard.css`，修改 `App.jsx`、`permissions.js`。

**Interfaces:** 看板使用 Task 1 的汇总；通过 `onSelectBu` 切换 BU，通过 `navigate` 进入管理页。

- [x] 接入四个指标、阶段及确认进度、任务分布、人员负荷和项目筛选表。
- [x] BU 管理员导航、面包屑和标题显示 BU看板；业务角色工作台保留。
- [x] 运行完整 `npm test`、`npm run build` 和 `git diff --check`。

### Task 3: 浏览器验收

- [x] 在独立浏览器存储验证 BU 管理员、SR、筛选、管理跳转、刷新和窄屏。
- [x] 审查最终 diff，记录验证和截图，保留改动供用户查看。

## 执行记录

- 沿用当前可用的 codex 功能分支及工作区，保留其他并行任务的改动和 selection-qa 文件。
- 新增七项 BU 汇总测试，观察到缺少汇总数据时失败，实现后七项全部通过。
- 全量验证曾为 170 项通过；最终复验 172 项中 171 项通过，唯一失败为并行机型流程工作新增的 prepareCapabilityImports 测试，未改写其他任务文件。本功能七项、生产构建和 git diff --check 通过。
- 浏览器验证 BU 身份、四张指标卡、阶段联动、搜索空态、重置、项目人员直达、全局搜索、管理入口、刷新以及 SR 工作台；检查 1440px 桌面容器和约 770px 窄屏。
- 预览保留在 http://127.0.0.1:5180/#/dashboard；测试使用独立端口存储。
- 截图位于 docs/prototype-updates/2026-10-27-bu-dashboard*.png。

- 独立审查完成，修复旧管理员状态缺少当前 BU 时误显示无权限的问题。回归测试 RED→GREEN；所选 BU 未授权仍拒绝。
