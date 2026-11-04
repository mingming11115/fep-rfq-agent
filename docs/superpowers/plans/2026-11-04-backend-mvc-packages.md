# 后端 MVC 包结构重构 Implementation Plan

**Goal:** 将 `apps/api` 按 MVC 与业务、持久化层组织，保持现有 HTTP 协议和业务规则。
**Architecture:** `controller → service → mapper → model.entity`；共享请求、响应和查询对象归入 `model.dto`、`model.vo`、`model.query`。配置、鉴权、文件存储与解析适配分别使用 `config`、`security`、`storage`、`integration` 包。
**Tech Stack:** Java 17、Spring Boot 3、MyBatis、MySQL、JUnit 5。
**Spec:** 用户要求“修改后端代码的包结构，要 MVC”。

## Constraints

- 复用当前工作区；按用户后续要求提交并推送本次后端重构，保留已有未跟踪验收文档，不替换运行包。
- 不调整 URL、JSON 字段、SQL、数据库迁移、权限规则及文件存储格式。
- 事务随业务逻辑迁入 Service，保留锁顺序、审计和回滚清理。
- 测试使用独立临时 MySQL 和文件目录，不连接业务数据库。

## Tasks

- [x] 增加 MVC 架构约束测试，先验证当前分包和 Controller 直连 Mapper 不符合约束。
- [x] 迁移生产和测试包，更新 Java 引用、MyBatis XML、类型别名配置。
- [x] 将认证、项目、原件、条款、审计和解析查询的业务处理从 Controller 提取到 Service，提取跨层使用的 DTO/VO。
- [x] 更新后端 README；清空临时构建产物后运行完整 Maven verify、架构约束及接口兼容检查。

## Review focus

Spring 组件与配置扫描；MyBatis 别名和查询对象全限定名；跨包可见性；事务代理和异常回滚；原件并发版本、条款解析互斥、BU 权限和审计；下载响应头与 Range/HEAD。

## Evidence

- 重构前架构约束：3 项中 2 项失败，正确发现业务包混放与 Controller 直接访问 Mapper。
- 重构后架构约束：3/3 通过。
- 13 个 Controller 的路由、CORS 与异常处理注解与原实现一致；11 个 Mapper XML 的命名空间和实体类型均可解析。
- 既有非拆分类的实现体已逐类核对；历史条款记录另移至 `model.vo.HistoryClause`。数据库 SQL 和迁移保持不变。
- `node scripts/check-layout.mjs` 通过。
- 完整 Maven verify：125 项通过，0 失败/错误/跳过；使用临时容器 `rfq-mvc-test-db` 和 `/tmp` 文件目录。
- 独立审查未发现 Critical/Important 问题；指出的历史响应模型依赖适配器问题已通过迁移条款记录修正。最后重新编译全部生产/测试代码，执行架构与历史解析定向 verify：9/9 通过并打包成功；11 个历史条款 JSON 字段一致。
- JUnit 报告与日志保存在 `.local/backend-mvc-20261104/`，最终 JAR 为 `apps/api/target/rfq-service.jar`。临时 MySQL 容器已删除；既有运行服务与分发包未替换。
