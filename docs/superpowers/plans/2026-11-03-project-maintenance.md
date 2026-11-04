# B09 项目维护 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成可验收的项目基本信息、负责人移交、归档与恢复。

**Architecture:** 扩展 Project，新增 V4 迁移及维护 Service/Controller。所有项目动作在项目锁及乐观锁下更新；归档读取继续按项目授权，业务写入统一阻断。

**Tech Stack:** Java 17、Spring Boot、MyBatis、MySQL 8、JUnit/MockMvc。

**Spec:** `docs/superpowers/specs/2026-11-03-project-maintenance-design.md`

## Global Constraints

- 保留现有基础管理代码及前端暂存改动；仅独立测试库验证；不推送/部署。
- 沿用 `/api/rfq`、统一 code/msg/data 和 PageView；历史迁移不修改。
- 所有动作需要 version 和 reason；拒绝未授权人员和任意阶段覆盖。

## Review Focus

- 部分更新的缺省字段/显式 null 混淆：Task 1 验证名称、客户、截止日期。
- 移交向未授权或停用 SR 泄露项目：Task 1 验证候选资格和现有成员授权。
- 归档后从文档/条款入口继续写：Task 2 覆盖全部入口并检查数据未变。
- 活动/归档分页 total 泄露其他项目：Task 2 验证 SQL 范围和计数。
- 归档与解析/条款修改并发产生遗漏：Task 3 使用真实数据库事务与受控调度验证项目行锁。

## Task 1: 基本信息与移交

**Files:** 新增 ProjectMaintenanceService/Controller、ProjectMaintenanceIntegrationTest；修改 Project、ProjectMapper/XML、ProjectController、AccessGuard；新增 V4__project_maintenance.sql。

**Interfaces:** PATCH /projects/{id}，POST /projects/{id}/handovers；ProjectView 扩展 deadline、归档信息；updateWithVersion(Project) 返回影响行数。

- [x] 保存上一批源码/暂存快照，独立库运行 85 项基线。
- [x] 编写部分更新、非法字段、负责人资格/授权、旧版本与权限测试并观察失败。
- [x] 实现请求校验、版本事务、移交及同事务审计，针对测试通过。

## Task 2: 归档/恢复与所有业务入口写保护

**Files:** 维护 Service/Controller；ProjectMapper 列表过滤；DocumentController、ParseService、RequirementController；新增 ProjectArchiveIntegrationTest。

**Interfaces:** POST /projects/{id}/archives 和 restorations；GET /projects 的 archived/keyword/stage；AccessGuard.requireActiveProject(Project)。

- [x] 编写归档/恢复、只查归档、分页计数、历史文件保留、写入口拒绝、旧状态拒绝测试，确认失败。
- [x] 实现归档元数据、恢复原阶段、SQL 过滤和项目→文档一致锁顺序；权限先于业务状态检查。
- [x] 验证所有新增用例和基础管理回归通过。

## Task 3: 并发验收及交付

**Files:** 新增 ProjectMaintenanceConcurrencyTest；同步后端清单、接口文档、README。

- [x] 验证先归档时后续条款/解析写入拒绝，先业务写入时归档等待其完成；不依赖睡眠判定提交顺序。
- [x] 完整 Maven verify、独立复查，重要发现按失败后通过回归修复。
- [x] 更新验收证据与 B09 勾选，核对源码与构建快照、原暂存补丁，生成验证 JAR 并清理测试库容器。
