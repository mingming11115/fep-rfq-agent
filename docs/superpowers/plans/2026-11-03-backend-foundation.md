# RFQ 后端基础管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 交付可在空库验收的 BU、人员、项目权限与审计后端。

**Architecture:** 扩展当前 rfq-service，新增 Flyway V3 结构，使用统一 AccessGuard 与 SQL 可见性谓词保护项目链路。管理行为与成功审计同事务，查询显式按 BU 过滤。

**Tech Stack:** Java 17、Spring Boot 3.5、MyBatis、MySQL 8、MockMvc/JUnit。

**Spec:** `docs/superpowers/specs/2026-11-03-backend-foundation-design.md`

## Global Constraints

- 保留 `/api/rfq`、JWT、`{code,msg,data}`、既有错误码与分页协议；修改历史迁移禁止。
- 仅使用独立测试库；保留其他任务的前端暂存内容；不部署或推送新功能。
- 未知权限默认拒绝；管理身份不自动授予原文读取或业务签署资格。

## Review Focus

- 同 BU 未授权人员通过原件/条款/解析结果 ID 绕过列表；由 Task 2 集成测试覆盖。
- 停用/撤权后复用旧 JWT；由 Task 1/2 集成测试覆盖。
- 多 BU 共享账号的全球变更影响其他 BU；由 Task 1 集成测试覆盖。
- 审计未知归属或操作人角色改变泄露历史；由 Task 3 集成测试覆盖。
- 并发/旧版本授权覆盖其他管理员的更改；由 Task 2 版本冲突测试覆盖。

## Task 1: 空库迁移与人员管理边界

**Files:** 新增 V3__admin_project_access.sql、AdminAcceptanceTest.java；修改 AdminService、BusinessUnitMemberController、AppUserMapper.xml、GlobalExceptionHandler。

**Interfaces:** 保持既有 admin REST 路径及数组候选人接口；membersOf 增加当前访问者 BU 校验；停用成员仍可管理。

- [x] 独立 MySQL 基线全套测试；增加资格写入/读取、跨 BU 目录、停用恢复、共享账号拒绝全球修改、角色越权、无效排序测试。
- [x] 运行针对测试观察预期失败（缺表/权限过宽/错误码）。
- [x] 实现资格迁移与校验，保留老表数据；修正跨 BU 边界与统一 400。
- [x] 运行针对测试直到通过并记录结果。

## Task 2: 项目授权和业务资源隔离

**Files:** 新增 ProjectMember、ProjectMemberMapper/XML、ProjectAccessService/Controller、ProjectAccessIntegrationTest；修改 AccessGuard、ProjectMapper/XML、ProjectController。

**Interfaces:** requireProject 统一执行有效 BU 角色 + 管理/负责人/显式成员策略；findAccessiblePage(actorId,q) / countAccessible(actorId)；access 元数据、members 分页和带项目 version 的成员 PATCH。

- [x] 增加同 BU 未授权拒绝、授权后可见与分页总数、撤销后旧 JWT 拒绝所有业务资源、平台仅可管理元数据、负责人校验、旧版本和无原因变更拒绝测试。
- [x] 运行新测试，确认在缺少端点及旧 BU-only 授权下失败。
- [x] 实现 SQL 可见性、成员维护事务和权限；项目创建校验负责人并保留其访问权。
- [x] 运行新旧测试直到通过。

## Task 3: 可按 BU 验收的审计查询和交付文档

**Files:** 新增 AuditController、AuditQuery、AuditQueryIntegrationTest；修改 AuditService、AuditEvent/Mapper/XML、管理与项目写审计；同步接口文档、README 和验收清单。

**Interfaces:** successInBu(actorId,buId,action,objectType,objectId,detail)；GET /audit 的过滤和 PageView。

- [x] 增加 BU 隔离、旧 null 归属隔离、过滤/分页/非法时间与排序、GET 零副作用、回滚无成功记录测试。
- [x] 先运行观察失败，再实现列与查询、事务一致写审计。
- [x] 执行完整 `mvn -o -B -ntp verify`；独立复查本批 diff 并修复重要问题。
- [x] 同步清单勾选、请求响应、实际测试命令/数量和剩余边界；核对原暂存区未变。
