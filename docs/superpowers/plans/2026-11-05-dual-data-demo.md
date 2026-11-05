# 两套数据入口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 独立启动完整前端模拟展示与实际 MySQL 数据展示，后端启动时插入可核对的模拟业务数据。
**Architecture:** mock 入口复用 App 并隔离真实后端调用；mysql 入口经 AuthGate 使用现有业务 API。Java 开发环境初始化器读取固定 JSON 种子，按缺失记录插入业务表并生成可下载 DOCX 原件。
**Tech Stack:** React、Vite、Ant Design、Java 17、Spring Boot、MySQL。
**Spec:** docs/superpowers/specs/2026-11-05-dual-data-demo-design.md

## Global Constraints

- 使用两个启动命令与端口 5173、5174；独立演示后端 48084，保留已有 48083。
- 不覆盖既有业务记录、密码、人工修改或已撤销的项目授权。
- MySQL 失败不回退前端种子，生产环境默认不初始化演示数据。
- 复用现有认证与业务 API；库中无表的模块不声称已经落库。

## Review Focus

- 无后端时 mock 可进入且不请求真实接口。
- 已有账号同名冲突必须失败，不覆盖密码或增加其权限。
- 重复启动不新增记录，不覆盖人工修改。
- 数据库列表分页、切换项目时不显示上个项目的迟到响应。
- 条款编辑冲突与断线必须显示错误，不提示保存成功。

### Task 1: 后端数据库种子

- [x] 先写初始化器测试，验证插入、重启保留和已有同名账号冲突。
- [x] 从已有前端种子导出固定八项目与三十三条要求 JSON。
- [x] 增加本地环境初始化器，写入现有业务表及真实 DOCX 原件；生产默认关闭。
- [x] 在用户指定本机 MySQL 的独立演示 BU 验证初始化和二次运行；不创建额外 MySQL 实例。

### Task 2: 两个前端入口

- [x] 先写模式分离、MySQL 客户端分页与错误传播测试。
- [x] 增加 mock/mysql 启动和构建命令，保留现有默认入口行为。
- [x] mock 跳过后端认证与目录同步，模拟创建不调用后端，真实服务操作明确提示。
- [x] mysql 增加数据库项目、原件、要求、成员展示和条款编辑、原件下载，全部走现有业务接口。

### Task 3: 启动与交付验证

- [x] 启动本机 MySQL、后端与两个前端入口并核对接口及 SQL 数量。
- [x] 测试条款编辑回读、旧版本冲突、权限范围、原件完整性和重启保留。
- [x] 运行前端回归、构建及后端相关测试；做一次整体代码审查。
- [x] 更新 README：启动命令、账号、开关、表名和已验证范围。

## 验证记录

- 后端初始化器测试 2/2；接口实测 8 项目、33 条款、7 原件，全部原件 SHA-256 和大小校验一致。
- 数据库销售/技术各见 8 项目，对照账号见 0；无授权详情及技术写入返回 403，旧版本写入返回 409。
- 修改条款后重启独立演示后端，编辑保留；验证后恢复原模拟标题。
- 前端身份/模式/项目相关 28/28；Craft/Office 隔离及客户端相关 23/23（其中 5 项与前一组重合）。
- 整体审查发现 Craft/Office 绕过 mock 边界，已补回归测试并验证 RED→GREEN。未发现其他重要问题。
- 全量前端串行测试曾遇执行环境中断，未取得完整结果；最终按变更范围验证。MySQL 版构建通过。
- mock 默认输出目录在内存不足的中断构建后遇 Windows 目录锁定；使用 GOMAXPROCS=2、NODE_OPTIONS=--max-old-space-size=1024，在 `.local/dual-data-demo/mock-build-verified` 新目录构建通过。遗留生成目录均保留在忽略路径中，未触碰原件和业务数据。
