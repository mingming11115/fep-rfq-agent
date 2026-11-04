# RFQ 项目维护接口 v0.1

日期：2026-11-03。对应后端验收清单 B09。基于上一批 BU/人员/项目权限与审计，新增项目维护；前端业务页面接入、生产部署和远程推送不包含在本轮。

## 公共约定和权限

前缀 `/api/rfq`；要求 Bearer JWT。成功 HTTP 200 + `{code:0,msg:"成功",data:ProjectView}`。写操作必填非负整数 version 与非空 reason（最多 500 字符），使用事务项目行锁及 SQL 乐观锁；成功仅递增一次版本，并在同事务记录审计。

仅本 BU 管理员或该项目当前负责人且具有本 BU SR 角色可以维护。普通技术、其他已授权 SR 和纯平台身份不能修改、移交或归档。负责人移交不会删除原负责人的已有项目授权或 SR 参与权限；其项目维护权随 ownerId 变化。如需撤销所有访问，仍由管理员使用项目授权接口处理。

错误：400 参数、未知字段或人员资格不满足；401 未登录/账号停用；403 无权维护项目；404 项目不存在；409 旧版本、错误阶段、归档写保护或数据库锁竞争。锁冲突提示刷新重试，不返回 SQL 或堆栈。

## 1. 修改基本信息

PATCH `/projects/{id}`

```json
{"version":3,"reason":"客户确认项目资料","name":"给水泵项目","customer":"ACME","deadline":"2026-12-31"}
```

| 字段 | 规则 |
| --- | --- |
| version | 必填整数，≥0，必须匹配当前项目版本 |
| reason | 必填非空，≤500 |
| name | 选填，非空文本，≤200；null 不能清空名称 |
| customer | 选填文本，≤200；显式 null 清空 |
| deadline | 选填 yyyy-MM-dd 日期，年份 1000–9999；显式 null 清空 |

未传字段保持原值；至少提供一个基本信息字段。额外字段返回 400，包含 code、buId、ownerId、stage 和归档元数据，不能借此修改归属、责任人或批准状态。截止日期也可通过既有 POST `/projects` 的可选 deadline 字段创建。

示例：`{"version":4,"reason":"取消原定期限","deadline":null}` 仅清空截止日期。

## 2. 移交负责人

POST `/projects/{id}/handovers`

```json
{"version":4,"reason":"项目交接","ownerId":"USR-接收人ID"}
```

接收人必须为同 BU 的有效 SR，账号和 BU 成员均启用，并已获本项目授权。移交不会自动替接收人补授权；管理员可先通过项目成员接口授权。技术、跨 BU、停用、未知或未授权人员返回 400；重复移交给现负责人返回 409。

移交后新负责人可以维护项目，原负责人保留已有读取与 SR 参与权限，并失去仅负责人拥有的项目维护/移交权。审计记录双方 ID、原因与版本变化。

## 3. 归档项目

POST `/projects/{id}/archives`

```json
{"version":5,"reason":"本轮客户项目结束"}
```

服务端将 stage 置为 CANCELLED，记录 archivedFromStage、archivedAt、archivedBy、archiveReason。已有项目、原件、解析记录、条款、成员和审计均保留。已归档或无法识别的旧阶段返回 409。

归档后暂停 `/api/rfq` 的以下业务写入：基本信息、移交、原件上传、示例上传、触发解析、人工修正条款。原有权限仍决定历史详情、原件、条款和解析结果的读取。项目授权管理继续开放，管理员仍可撤销归档项目的访问。

解析当前同步执行，与归档共用项目行锁；解析/人工修正统一先锁项目再锁文档。归档不会与已经开始的业务事务交错提交。独立 craft/office 批阅协议的项目鉴权接入属于 B23，本轮不扩展这些独立入口。

重解析在取得项目和文档锁后，使用当前锁定读取校验已有条款版本；即使事务先前已创建数据库快照，也能发现刚提交的人工修正并返回 409，不会覆盖人工条款。

## 4. 恢复项目

POST `/projects/{id}/restorations`

```json
{"version":6,"reason":"客户重新启动项目"}
```

仅 CANCELLED 可以恢复，且必须存在可识别的 archivedFromStage。恢复原阶段并清除当前归档字段；历史归档/恢复操作继续保存在审计中。旧记录缺少原阶段时返回 409，不猜测其业务状态。

本轮没有通用阶段修改接口。DRAFT/PARSING 沿用既有创建/上传动作；REVIEWING/APPROVED/EXPORTED 留给对应业务流程维护，不能通过 PATCH 或归档请求自行声称批准/导出。

## 5. 项目查询和响应

GET `/projects?page=1&size=20&archived=false&keyword=ACME&stage=PARSING`

- archived 默认 false，查询可见活动项目；true 只查询可见归档项目。
- keyword 搜索编码、名称、客户，最多 200 字符；按普通文本匹配，`%`、`_` 不作为用户通配符。
- stage 选填：DRAFT、PARSING、REVIEWING、APPROVED、EXPORTED、CANCELLED；其他值 400。
- 权限、归档状态和过滤都在 SQL 分页及计数前执行；archived=false 与 stage=CANCELLED 组合得到空页。
- 原 page/size/sort 约定不变，GET 不写审计。归档详情仍可按 ID 读取，但同样需要项目访问权。

ProjectView 在既有字段上增加：

```json
{"id":"RFQ-...","code":"RFQ-2026-001","name":"给水泵项目","customer":"ACME","buId":"BU-FEP","ownerId":"USR-...","stage":"CANCELLED","version":6,"createdAt":"2026-11-03T00:00:00Z","deadline":"2026-12-31","archived":true,"archivedFromStage":"PARSING","archivedAt":"2026-11-03T01:00:00Z","archivedBy":"USR-...","archiveReason":"本轮客户项目结束"}
```

未归档或已恢复时 archived=false、归档元数据为 null。新增 V4__project_maintenance.sql，保留 V1–V3 与既有数据，不提供物理删除接口。
