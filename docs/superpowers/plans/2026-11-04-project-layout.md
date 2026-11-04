# 工程目录重组 Implementation Plan

Goal: 将用户确认的工程结构落实为 apps/web、apps/api、packages/craft-editors、tests/browser、scripts 与分类 docs。
Architecture: 仅调整目录及引用；保持前后端独立构建，新增根目录命令入口。编辑器源码、编译资源和许可证一并保留。业务 data 和本地 runtime 随后端迁移，历史报告和个人工具资料归档。
Tech Stack: React/Vite/Node、Java 17/Maven、PowerShell。
Spec: 本会话中用户确认的目录方案。

- [x] 记录文件迁移映射及运行数据校验摘要；增加工程结构检查（先失败）。
- [x] 原生 PowerShell 移动目录及文档；清理明确可再生成的目录与日志、空目录。
- [x] 更新代码、测试、构建、CI、文档相对链接及本地诊断路径。
- [x] 增加根 README 和开发命令；完善忽略规则；保留历史产物到本地归档。
- [x] 运行结构检查、前端全量测试与构建、编辑器测试；可用时运行后端验证；独立复核并记录限制。

Constraints: 不删业务数据、原件、密钥及本地启动包；不修改业务行为；不自动提交或推送；不重建依赖或重新编译原生编辑器。
Review focus: 跨目录 import、Vite 文件访问范围、编辑器构建缓存、文档相对链接、CI 工作目录、后端默认数据路径、个人绝对路径、归档内依赖链接。
Ruling: 复用当前 master 工作区；用户要求整理本工作区，目录移动需包含现有本地运行数据和依赖，额外 worktree 无法达成该目标。

Validation: npm test（505 frontend + 25 editors）、npm run build；Maven DocumentStorageTest/ParsingAdaptersTest 共 16 项及 package；38 个数据/运行包 SHA-256 一致；HTTP smoke 4/4。
Ruling: 后端仅跑无数据库单元测试与打包，避免目录整理写入正在使用的业务数据库。
Ruling: 历史报告保留在 docs/archive/artifacts，IDE/日志/临时锁文件保留在 .local；清空未使用 Gitlink 占位（提交号见 project-layout.md）。

开发工具校验补充：带空格的 Maven 路径真实启动测试 1/1 通过，已接入根测试入口。
