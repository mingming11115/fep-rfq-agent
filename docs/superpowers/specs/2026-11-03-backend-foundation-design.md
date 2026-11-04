# RFQ 后端基础管理设计

用户要求梳理完整后端验收功能并开始开发，明确首批为“BU、人员、项目权限、审计”。全量清单见 `docs/RFQ后端开发验收清单_2026-11-03.md`。

## 范围和实现选择

延续当前 Java 17 / Spring Boot 3.5 / MyBatis / MySQL 8 的 `rfq-service`；沿用 `/api/rfq`、JWT、`{code,msg,data}`、分页和版本规范。现有管理 API 已覆盖大部分 CRUD，首批补齐真正缺失的数据迁移、项目授权和审计查询，同时修复管理边界。无需重建服务或迁移到仓库中的另一套 Yudao 应用。后两种路线会增加接口与部署迁移成本，本轮选择扩展当前服务，这是实施判断。

本批不实现应答/最终评审、知识库、企业认证或真实通知；不修改其他任务暂存的前端文件，不更新正在运行的演示服务及业务库。使用独立 MySQL 容器运行迁移与集成测试。

## 权限与兼容

平台管理员维护全部组织和授权元数据；仅凭平台身份不获得项目原文。对应 BU 管理员管理本 BU 并访问本 BU 项目。普通 SR/TECH（兼容已有 APPROVER）必须有本 BU 有效角色，并为项目负责人或显式授权成员，才能读取项目及其来源、条款和解析结果。项目负责人必须为本 BU 有效 SR。现有项目只补齐负责人授权，不批量授权其他 BU 人员。

`GET /projects` 由 SQL 执行同样的权限谓词后分页/计数；所有按 ID 业务读取统一复用 `AccessGuard.requireProject`。所有项目来源写接口同时校验项目与来源维护角色。撤销成员、停用账号/BU 角色后每次请求重新查有效角色，权限立即生效。

项目授权仅平台/对应 BU 管理员维护。新增 `GET /projects/{id}/access` 返回 projectId/buId/ownerId/version；`GET /projects/{id}/members` 返回分页成员；`PATCH /projects/{id}/members/{userId}` 接收必填非负 version、enabled、reason（1–500 字）。事务锁项目、比对版本、写成员启停并递增项目版本；不能直接撤销负责人。授权启用时接收人为本 BU 启用的业务账号；撤销允许处理已经停用的成员。管理授权不授予条款确认或最终评审资格。

人员资格表通过新迁移创建；资格默认全部 false，不替历史数据猜测授予。业务侧成员目录必须校验 BU 读取权；管理侧保留停用成员。全球账号停用、资料/密码修改会影响全部 BU，故 BU 管理员仅在覆盖目标全部已知 BU 归属时允许这些动作；跨 BU 共享账号的本 BU 启停/资格仍可正常维护。角色维护不能让 BU 管理员授予或撤销 BU_ADMIN。账号列表和详情响应不得泄露管理范围外的角色。

## 存储与审计

新增 V3 迁移（历史知识文档中的“V3”仅为草案编号，后续应重新编号）：创建 `bu_member_profile`（兼容已人工创建表，保留数据）、`project_member`（project_id/user_id 唯一，enabled、granted_by、created_at、updated_at）并为 `audit_event` 新增可空 bu_id 与分页索引。项目成员没有物理删除接口。迁移不改 V1/V2。

新增 `GET /audit`：page/size/sort、buId、actorId、action、objectType、objectId、result、createdFrom/createdTo；sort 只允许 createdAt，默认 desc。平台可查全部；BU 管理员只能查管理的 BU；业务角色 403。SQL 在分页和计数前施加范围。旧无归属事件保持 null，仅平台可见，不能按操作人当前角色推断历史归属。

`AuditService.successInBu` 显式记录归属；现有全局 success 保留供兼容。管理写入与成功审计在同一事务，失败日志保留独立事务能力。账号全局变更在相关 BU 分别留痕，密码重置只记录动作。GET 不写审计；失败不产生成功记录。本批不新增全站失败请求日志采集。

## 验证与剩余边界

实施细化：成员暂停独立保存为 `bu_member_profile.enabled`，角色撤销仍用 `user_bu_role.status`；认证和项目 SQL 都校验暂停状态。这样启用成员不会复活已经撤销的角色。所有旧档案默认 enabled=true，原资格值保留。

在全新独立 MySQL 8 中先运行基线。先增加 HTTP/真实 Mapper 集成测试观察失败，再实现迁移与权限。验证 BU CRUD、账号/角色、资格、同 BU 未授权与跨 BU 拒绝、撤权后旧 token、分页 total、文件下载/解析结果、版本冲突、审计范围和读取零副作用；最后运行 `mvn verify` 全套测试和构建。成员目录现有数组协议本批保留，以兼容当前候选人同步；高规模候选目录的分页接口列为后续兼容改造，不改变现有数组消费者。

craft/office 目前独立鉴权，接入项目权限属于后续文件协作批次，不能宣称本批已保护这些独立入口。前端项目业务数据仍为演示，本批后端接口验收不等于已替换全部前端存储。
