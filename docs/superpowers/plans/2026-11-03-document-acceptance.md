# B10 文档原件验收 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Track steps with checkboxes.

**Goal:** 验证并完善不可变原件、可靠上传版本、真实校验与受权限保护的下载。

**Architecture:** 复用 DocumentController/Storage 和项目事务锁；增加文档详情、当前版本读取、唯一索引及下载前流式校验。解析只写状态，已有下载协议保持。

**Tech Stack:** Java17、Spring Boot、MyBatis、MySQL8、POI/PDFBox、MockMvc/真实HTTP。

**Spec:** `docs/superpowers/specs/2026-11-03-document-acceptance-design.md`

## Global Constraints

- 原暂存区、B09 源码及 V1–V4 保留；独立测试库；不部署/推送。
- 30 MiB 精确上限；文件名≤255；服务端分配 ID/版本/MIME，不暴露内部路径。
- 成功审计同事务；读取零副作用；归档写保护及项目权限不回退。

## Review Focus

- 客户端声明大小/类型与实际不符：Task1 流长度和 MIME 用例。
- RR 旧快照使并发版本重复：Task2 嵌套事务旧快照与双线程上传。
- 写状态时覆盖原件元数据：Task2 真正 Mapper 写入后回读所有不可变字段。
- Servlet 超限与 MockMvc 的差异：Task3 真实 HTTP multipart 测试。
- 下载验证改变 Range/HEAD 或权限：Task1 实际字节、响应头、Range/HEAD 与权限回归。

## Task1: 校验、详情和下载

**Files:** DocumentController、DocumentStorage、DocumentStorageTest、新增 DocumentAcceptanceTest。

- [x] 保存源码/暂存快照，运行 103 项基线。
- [x] 新增文件名/MIME/详情/校验哈希/损坏下载/读权限/Range/HEAD/回滚测试并观察失败。
- [x] 实现限制与规范 MIME、元数据详情、下载前校验，保留原有读协议；针对用例通过。

## Task2: 版本与原件元数据不可变

**Files:** CustomerDocumentMapper/XML、V5__document_version.sql、DocumentController、DocumentVersionConcurrencyTest。

- [x] 新增旧快照分配、并发上传、唯一性、版本上限、状态写入保护测试，确认当前缺口。
- [x] 项目锁下用当前读取分配版本，增加唯一索引；状态写仅影响 status；失败清理仍生效。
- [x] 验证旧版本字节和元数据保持不变，相关回归通过。

## Task3: 容量边界、实际 HTTP 与交付

**Files:** 存储边界测试、新增 DocumentUploadHttpTest、错误处理、README/接口及验收清单。

- [x] 实际流超限、声明超限和恰好上限验证；真实 HTTP 验证 multipart 超限413及无业务记录。
- [x] 全套 verify、独立复查，重要发现按失败后通过回归修复。
- [x] 新库 V1–V5 与全套测试通过，记录证据、更新 JAR，核对原暂存和旧迁移并清理测试容器。
