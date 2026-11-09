# FEP RFQ 后端接口文档 v0.2

> 对应实现：`rfq-service`（Spring Boot 3 / Java 17）
> 编写依据：`docs/RFQ后端接口规范_CRUD_v0.1.md`（下称《规范》）
> 更新时间：2026-11-03 ｜ 状态：基础管理、项目权限与审计已补齐；首批验收见《RFQ 后端开发验收清单》
> 组织方式：**按资源分组**（规范 §7），组内接口标注五件套归属

---

## 1. 全局约定

### 1.1 基础信息

| 项 | 值 |
|---|---|
| Base URL | `http://127.0.0.1:48083` |
| 内容类型 | `application/json; charset=UTF-8`（文件上传除外） |
| 前端代理 | Vite 已将 `/api` 代理到 48083，前端可直接写相对路径 |

### 1.2 认证（规范 §5）

除 `POST /api/rfq/auth/login` 外，所有 `/api/rfq/**` 接口都需要：

```
Authorization: Bearer <token>
```

未登录 / token 无效统一返回：

```json
HTTP 401
{ "code": 401, "msg": "请先登录", "data": null }
```

### 1.3 统一响应包装（规范 §3.1，全接口强制）

```json
{ "code": 0, "msg": "成功", "data": { ... } }
```

成功 `code=0`（HTTP 一律 200，本项目不用 201/204）；失败 `code` 同 HTTP 状态码，`msg` 为可直接展示的中文，`data=null`。

### 1.4 错误码（规范 §3.2 固定表）

| code | HTTP | 语义 |
|---|---|---|
| 0 | 200 | 成功 |
| 400 | 400 | 参数/业务规则不通过 |
| 401 | 401 | 未登录、token 过期、账号停用 |
| 403 | 403 | 无权访问该事业部数据 / 角色不允许该操作 |
| 404 | 404 | 资源不存在 |
| 409 | 409 | 乐观锁冲突 / 状态冲突 |
| 500 | 500 | 未预期异常（不暴露堆栈） |

### 1.5 角色与权限（规范 §5，服务端校验）

| 角色 | 数据能力 |
|---|---|
| `SR` | 建项目；在本 BU 获授权项目内上传文件、解析和修正条款 |
| `BU_ADMIN` | 同 SR |
| `TECH` / `APPROVER` | 本 BU 获授权项目只读；APPROVER 为兼容角色 |
| `systemAdmin` | 管理全部 BU、账号及授权元数据；不自动取得项目正文读取权 |

**BU 与项目隔离**：所有按 ID 的业务读写均先校验 BU、有效成员身份及项目授权；本 BU 管理员拥有本 BU 项目管理访问权，普通业务人员须为负责人或显式授权成员。加入 BU 不自动开放所有项目。停用/撤权后旧 JWT 下一次请求立即按最新权限校验。

### 1.6 演示账号（种子数据，仅 local profile）

| username | 姓名 | 角色 |
|---|---|---|
| `sr01` | 张明 | SR |
| `tech01` | 李工 | TECH |
| `appr01` | 王强 | APPROVER |
| `bu01` | 陈静 | BU_ADMIN |

演示库初始化和登录方式见 [启动指南](../../启动.md)。

### 1.7 分页信封（规范 §2.3）—— ✅ 已实现

三个列表接口（项目、文档、条款）均已支持分页：

```
GET ...?page=1&size=20&sort=createdAt,desc
```

| 参数 | 默认值 | 约束 |
|---|---|---|
| `page` | 1 | ≥ 1 |
| `size` | 20 | 1–100（超出截断） |
| `sort` | 各接口不同 | **字段白名单**，非法字段返回 400 并提示允许值 |

响应 `data` 统一为：

```json
{ "list": [...], "page": 1, "size": 20, "total": 137, "totalPages": 7 }
```

各接口白名单：条款 `sortOrder`（默认 `sortOrder,asc`）、`createdAt`；项目/文档 `createdAt`（默认 `createdAt,desc`）。

---

## 2. 资源：认证会话（auth）

> 五件套归属：本资源只有「登录换凭证」和「查当前会话」两个动作，无增删改。

| # | 方法 | 路径 | 归属 | 规范状态 |
|---|---|---|---|---|
| 2.1 | POST | `/api/rfq/auth/login` | 登录 | ✅ 符合（全局放行的唯一接口） |
| 2.2 | GET | `/api/rfq/auth/me` | 查会话 | ✅ 符合 |

### 2.1 登录

```
POST /api/rfq/auth/login
```

**请求参数**

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Body(JSON) | `username` | string | ✅ | 登录账号，如 `sr01` |
| Body(JSON) | `password` | string | ✅ | 密码 |

**响应 `data`**

```json
{
  "token": "eyJhbGciOi...",
  "expiresInSeconds": 28800,
  "user": {
    "id": "demo-sales",
    "displayName": "张明",
    "systemAdmin": false,
    "roles": [ { "buId": "BU-FEP", "role": "SR" } ],
    "bus": [ { "id": "BU-FEP", "code": "FEP", "name": "FEP 事业部" } ]
  }
}
```

**错误**：`401 账号或密码错误` / `401 账号不可用`

### 2.2 当前用户

```
GET /api/rfq/auth/me
```

无业务参数（Header 认证）。响应 `data` 同登录返回中的 `user`。用于页面刷新后恢复会话。

---

## 3. 资源：项目（project）

> 五件套：查列表 ✅ ／ 查单个 ✅ ／ 增 ✅ ／ 改 ✅ ／ 归档与恢复 ✅（无物理删除）。基本信息、负责人移交、归档、恢复及新增查询参数见 [项目维护接口 v0.1](RFQ项目维护接口_v0.1.md)。所有项目维护写操作要求当前 version 与原因。

| # | 方法 | 路径 | 归属 | 规范状态 |
|---|---|---|---|---|
| 3.1 | GET | `/api/rfq/projects` | 查列表（分页） | ✅ 符合 |
| 3.2 | GET | `/api/rfq/projects/{id}` | 查单个 | ✅ 符合（含 IDOR 防护） |
| 3.3 | POST | `/api/rfq/projects` | 增 | ✅ 符合 |
| 3.4 | PATCH | `/api/rfq/projects/{id}` | 修改基本信息 | ✅ B09 |
| 3.5 | POST | `/api/rfq/projects/{id}/handovers` | 移交负责人 | ✅ B09 |
| 3.6 | POST | `/api/rfq/projects/{id}/archives` | 归档 | ✅ B09 |
| 3.7 | POST | `/api/rfq/projects/{id}/restorations` | 恢复 | ✅ B09 |

**ProjectView 结构**

```json
{
  "id": "RFQ-a1b2c3d4",
  "code": "RFQ-2026-001",
  "name": "锅炉给水泵采购",
  "customer": "华北电力",
  "buId": "BU-FEP",
  "ownerId": "demo-sales",
  "stage": "DRAFT",
  "version": 0,
  "createdAt": "2026-11-02T09:00:00Z"
}
```

**stage 流转**：`DRAFT → PARSING（上传文件后服务端自动置为）→ ...（后续随审批切片扩展）`

### 3.1 项目列表

```
GET /api/rfq/projects?page=1&size=20&sort=createdAt,desc
```

**请求参数**

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Query | `page` | int | ❌ | 页码，默认 1 |
| Query | `size` | int | ❌ | 每页条数，默认 20，上限 100 |
| Query | `sort` | string | ❌ | 白名单：`createdAt`，默认 `createdAt,desc` |

过滤规则由服务端 SQL 决定：对应 BU 管理员可见该 BU；普通业务人员仅见有效角色和项目授权共同允许的项目。过滤在分页及计数前生效；只有平台身份时列表为空。

默认 archived=false，仅返回活动项目；archived=true 只查归档项目。另支持 keyword（编码/名称/客户）和 stage 白名单过滤。ProjectView 另含 deadline、archived 与归档元数据；详见项目维护接口说明。

**响应 `data`**：分页信封（§1.7），`list` 元素为 `ProjectView`

### 3.2 项目详情

```
GET /api/rfq/projects/{id}
```

**请求参数**

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Path | `id` | string | ✅ | 项目 ID |

**错误**：`404 项目不存在` / `403 无权访问该事业部数据`

### 3.3 创建项目

```
POST /api/rfq/projects
```

**请求参数**

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Body(JSON) | `code` | string | ✅ | 项目编号，2–32 位字母/数字/下划线/短横线，全局唯一（不区分大小写） |
| Body(JSON) | `name` | string | ✅ | 项目名称 |
| Body(JSON) | `customer` | string | ❌ | 客户名称 |
| Body(JSON) | `ownerId` | string | ❌ | 负责人，缺省为当前用户 |
| Body(JSON) | `buId` | string | ❌ | 所属 BU，缺省取当前用户第一个 BU |
| Body(JSON) | `groupId` | string | ✅ | 当前 BU 的一个启用分组。分组及其上级和对应层级均须启用 |

```json
{ "code": "RFQ-2026-002", "name": "循环水泵改造", "customer": "南方电网", "groupId": "<当前 BU 分组 ID>" }
```

**权限**：SR / BU_ADMIN（规范 §5 顺序：归属校验 → 角色校验 → 业务）
**错误**：项目编号重复、分组缺失或不属于当前 BU 时返回 400。分组、上级或层级已停用时返回 409。

创建、列表和详情返回绑定时保存的 `groupId`、`groupPath`、`groupCatalogVersion` 和 `groupValues`。此前未绑定分组的项目省略这些字段。

---

## 4. 资源：客户文档（document）

> B10 更新：详情、规范 MIME、文件名与流长度校验、当前读取版本分配/唯一约束、下载前完整性检查和 HTTP Range/HEAD，见 [原件上传与下载接口 v0.1](RFQ原件上传与下载接口_v0.1.md)。版本表示项目内上传序号，原件不覆盖。

> 五件套：查列表 ✅ ／ 查单个 ✅ ／ 增（上传）✅ ／ 改（原件不可覆盖，仅内部解析状态更新）／ 删（不提供物理删除；文件独立归档由后续来源管理处理）

| # | 方法 | 路径 | 归属 | 规范状态 |
|---|---|---|---|---|
| 4.1 | GET | `/api/rfq/projects/{projectId}/documents` | 查列表（分页） | ✅ 符合 |
| 4.2 | POST | `/api/rfq/projects/{projectId}/documents` | 增（multipart 上传） | ✅ 符合 |
| 4.3 | POST | `/api/rfq/projects/{projectId}/documents/sample` | 增（动作：载入示例） | ✅ 符合（动作子资源） |

**DocumentView 结构**

```json
{
  "id": "DOC-x1y2z3a4b5",
  "projectId": "RFQ-a1b2c3d4",
  "name": "给水泵技术协议.docx",
  "version": 1,
  "purpose": "REQUIREMENT_SOURCE",
  "sizeBytes": 245760,
  "sha256": "e3b0c442...",
  "status": "UPLOADED",
  "uploadedBy": "demo-sales",
  "createdAt": "2026-11-02T09:05:00Z"
}
```

**status 状态机**：`UPLOADED → PARSING → PARSED / FAILED`（由解析动作接口推演，禁止 PATCH 直接改，规范 §4.2）

### 4.1 文档列表

```
GET /api/rfq/projects/{projectId}/documents?page=1&size=20&sort=createdAt,desc
```

**请求参数**

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Path | `projectId` | string | ✅ | 项目 ID |
| Query | `page` | int | ❌ | 页码，默认 1 |
| Query | `size` | int | ❌ | 每页条数，默认 20，上限 100 |
| Query | `sort` | string | ❌ | 白名单：`createdAt`，默认 `createdAt,desc` |

**响应 `data`**：分页信封（§1.7），`list` 元素为 `DocumentView`

### 4.2 上传客户文件

```
POST /api/rfq/projects/{projectId}/documents
Content-Type: multipart/form-data
```

**请求参数**

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Path | `projectId` | string | ✅ | 项目 ID |
| Header | `Authorization` | string | ✅ | `Bearer <token>` |
| Form-Data | `file` | binary | ✅ | **字段名必须是 `file`**，仅 `.docx` / `.pdf`，上限 30MB |

**调用示例**

```bash
curl -X POST http://127.0.0.1:48083/api/rfq/projects/RFQ-a1b2c3d4/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@给水泵技术协议.docx"
```

```javascript
// 前端：用 FormData，不要手动设置 Content-Type（boundary 由浏览器生成）
const form = new FormData();
form.append('file', fileInput.files[0]);
fetch(`/api/rfq/projects/${projectId}/documents`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

**行为**：流式落盘（SHA-256 同步计算）→ 建文档记录（版本号自动 +1）→ 项目 stage 置 `PARSING` → 写审计。上传**不会**自动解析，需调用 5.1。

**错误**：`400 请选择要上传的文件` / `400 当前仅支持 DOCX / PDF。DOC 请先另存为 DOCX 再上传：xxx`

### 4.3 载入示例 RFQ

```
POST /api/rfq/projects/{projectId}/documents/sample
```

**请求参数**

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Path | `projectId` | string | ✅ | 项目 ID |

**权限**：SR / BU_ADMIN

不传文件。服务端用 POI 现场生成一份固定的锅炉给水泵 RFQ DOCX（5 章节、编号层级、指标条款、参数表），走与真实上传**完全相同**的入库链路。文件内容固定 → 解析结果可复现，用于无真实文件时验证全链路与造演示数据。响应 `data` 同 `DocumentView`。

---

## 5. 资源：解析任务（parse-run）

> 五件套：本资源由动作接口创建（规范 §4.2 状态机操作），只可查，不可改删。

| # | 方法 | 路径 | 归属 | 规范状态 |
|---|---|---|---|---|
| 5.1 | POST | `/api/rfq/documents/{documentId}/parse-runs` | 动作：触发解析 | ✅ 符合 |
| 5.2 | GET | `/api/rfq/parse-runs/{runId}` | 查单个 | ✅ 符合（含 IDOR 防护） |
| 5.3 | GET | `/api/rfq/documents/{documentId}/blocks` | 关联资源：内容块 | ✅ 符合 |

**ParseRunView 结构**

```json
{
  "id": "RUN-k9l0m1n2o3",
  "documentId": "DOC-x1y2z3a4b5",
  "status": "SUCCEEDED",
  "totalBlocks": 42,
  "processedBlocks": 42,
  "requirementCount": 18,
  "issueCount": 2,
  "message": "",
  "startedAt": "2026-11-02T09:06:00Z",
  "finishedAt": "2026-11-02T09:06:03Z",
  "extractor": "rule-v1"
}
```

### 5.1 触发解析（当前为同步接口）

```
POST /api/rfq/documents/{documentId}/parse-runs
```

**请求参数**

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Path | `documentId` | string | ✅ | 文档 ID |

**权限**：SR / BU_ADMIN

**行为**：读取文件（DOCX→POI，PDF→PDFBox）→ 内容块入库 → 规则版条款抽取（编号层级 + 指标/单位 + 强制性措辞）→ 条款入库 → 记录解析运行。返回时解析已完成；重复触发生成新 run，历史 run 可回查。

### 5.2 查询解析任务

```
GET /api/rfq/parse-runs/{runId}
```

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Path | `runId` | string | ✅ | 解析任务 ID |

**响应 `data`**：完整 `ParseRun` 记录。

### 5.3 文档内容块

```
GET /api/rfq/documents/{documentId}/blocks
```

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Path | `documentId` | string | ✅ | 文档 ID |

解析中间产物（阅读层），供前端原文定位、条款锚点预览。按 `blockIndex` 排序：

```json
[{
  "id": "BLK-0001",
  "blockIndex": 0,
  "type": "heading",
  "sectionPath": "2 技术要求 > 2.1 性能参数",
  "customerClauseNo": "2.1",
  "content": "2.1 性能参数",
  "sourceAnchor": "docx#body[3]",
  "provenance": "native"
}]
```

---

## 6. 资源：条款（requirement）

> 五件套：查列表 ✅ ／ 查单个（无场景，暂缓）／ 增（由解析产生，不开放手工创建）／ 改 ✅ ／ 删（规范 §1.4，走状态流转，未实现）

| # | 方法 | 路径 | 归属 | 规范状态 |
|---|---|---|---|---|
| 6.1 | GET | `/api/rfq/projects/{projectId}/requirements` | 查列表（分页） | ✅ 符合 |
| 6.2 | PATCH | `/api/rfq/requirements/{id}` | 改（部分更新 + 乐观锁） | ✅ 符合（规范 §4.1 参考实现） |

**RequirementView 结构**

```json
{
  "id": "REQ-a1b2c3d4e5",
  "projectId": "RFQ-a1b2c3d4",
  "documentId": "DOC-x1y2z3a4b5",
  "customerClauseNo": "2.1.1",
  "sectionPath": "2 技术要求 > 2.1 性能参数",
  "title": "性能参数",
  "level": 3,
  "parentId": "REQ-parent01",
  "originalText": "额定工况下，给水泵流量不得低于 1200 m3/h，扬程不低于 2800 m。",
  "requirementText": "额定流量不低于 1200 m3/h；额定扬程不低于 2800 m",
  "metricsJson": "[{\"name\":\"流量\",\"value\":\"1200\",\"unit\":\"m3/h\"}]",
  "conditionsText": "额定工况下",
  "obligation": "MANDATORY",
  "extractionStatus": "VALID",
  "reviewReasons": "流量与扬程两个指标共现于一句，已拆分",
  "sortOrder": 5,
  "version": 1
}
```

| 关键字段 | 说明 |
|---|---|
| `customerClauseNo` | 客户原条款号，**自由文本**（可为空、重复、跳号），绝不作为主键 |
| `obligation` | `MANDATORY`（应/须/不得）/ `RECOMMENDED`（宜/建议）/ `INFO` |
| `extractionStatus` | `AUTO`（规则抽取待人工确认）→ `VALID`（人工确认/修正后） |
| `metricsJson` | 指标数组（名称/数值/单位）的 JSON 字符串 |
| `version` | 乐观锁版本号，修正时必须带回 |

### 6.1 条款列表

```
GET /api/rfq/projects/{projectId}/requirements?page=1&size=20&sort=sortOrder,asc
```

**请求参数**

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Path | `projectId` | string | ✅ | 项目 ID |
| Query | `page` | int | ❌ | 页码，默认 1 |
| Query | `size` | int | ❌ | 每页条数，默认 20，上限 100 |
| Query | `sort` | string | ❌ | 白名单：`sortOrder`（默认 `sortOrder,asc`）、`createdAt` |

**响应 `data`**：分页信封（§1.7），`list` 元素为 `RequirementView`。SR/TECH/APPROVER 均可读。

### 6.2 修正条款

```
PATCH /api/rfq/requirements/{id}
```

**请求参数**

| 位置 | 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| Path | `id` | string | ✅ | 条款 ID |

**权限**：SR / BU_ADMIN

**Body（全部可选，只传要改的——规范 §1.3 PATCH 语义）**

| Body 字段 | 类型 | 说明 |
|---|---|---|
| `version` | long | ❌ 乐观锁版本号。传了则与库中比对，不一致返回 409 |
| `customerClauseNo` | string | ❌ 客户条款号修正 |
| `title` | string | ❌ 条款标题修正 |
| `level` | int | ❌ 层级修正（最小 1） |
| `requirementText` | string | ❌ 归一化要求文本修正 |
| `reviewReasons` | string | ❌ 修正原因（进审计） |

**行为**：人工修正后 `extractionStatus` 自动置 `VALID`；修正写审计。

**错误**：`404 条款不存在` / `403 无权访问` / `409 条款已被他人修改，请刷新后重试`

---

## 7. 既有接口（本次未改动，规范体系外）

### 7.1 craft 批阅（`/api/craft`）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/craft/documents` | 上传批阅文件（multipart） |
| GET | `/api/craft/documents/{id}` | 文档元数据 |
| GET | `/api/craft/documents/{id}/download?kind=original\|review` | 下载原件/批阅版 |
| PUT | `/api/craft/documents/{id}/review` | 保存批阅版（If-Match 乐观锁） |

### 7.2 Office 文档服务（`/api/office`）

`/status`、`/documents`、`/documents/{id}`、`/documents/{id}/session`、`/documents/{id}/save`、`/documents/{id}/download`、`/content/{id}`、`/callback/{id}`、`/plugin/*`——ONLYOFFICE 集成保留，认证走 `X-Office-Access` 头，不在 JWT 体系内。

---

## 8. 管理接口与后续开发范围

基础管理、成员资格、项目授权和审计的实际路径、参数、响应与权限，见 [基础管理接口 v0.1](RFQ基础管理接口_v0.1.md)。原 `/admin/bus` 占位路径未启用，实际为 `/admin/business-units`。原件下载已在 §4 实现。以下业务流程仍待开发：

| 接口 | 归属切片 | 说明 |
|---|---|---|
| `POST /api/rfq/projects/{id}/deviations` | P3 流程 | 偏离项登记（规范 §6 骨架示例资源） |
| `POST /api/rfq/projects/{id}/snapshots` | P3 流程 | 审批快照 + 指纹 |
| `POST /api/rfq/projects/{id}/exports` | P3 流程 | 导出应答稿记录 |
| `POST /api/rfq/requirements/{id}/answer` | P3 流程 | 条款话术应答（LLM 层） |

**列表分页改造状态**：✅ 已完成——项目、文档、条款三个列表接口均按规范 §2.3 支持 `page/size/sort`（白名单校验）。后续新增列表接口直接复用 `common/api/PageView`。

---

## 9. 联调速查（curl 示例）

```bash
# 注意：本机 curl 需带 --noproxy "*" 绕过终端代理

# 1) 登录拿 token
TOKEN=$(curl -s --noproxy "*" -X POST http://127.0.0.1:48083/api/rfq/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"sr01","password":"<演示密码>"}' | python -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

# 2) 创建项目。将占位值替换为所属 BU 已启用的分组 ID。
curl -s --noproxy "*" -X POST http://127.0.0.1:48083/api/rfq/projects \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"code":"RFQ-TEST-001","name":"联调测试项目","groupId":"<当前 BU 分组 ID>"}'

# 3) 载入示例 RFQ（无需真实文件）
curl -s --noproxy "*" -X POST http://127.0.0.1:48083/api/rfq/projects/<projectId>/documents/sample \
  -H "Authorization: Bearer $TOKEN"

# 4) 触发解析
curl -s --noproxy "*" -X POST http://127.0.0.1:48083/api/rfq/documents/<docId>/parse-runs \
  -H "Authorization: Bearer $TOKEN"

# 5) 查看抽取出的条款
curl -s --noproxy "*" http://127.0.0.1:48083/api/rfq/projects/<projectId>/requirements \
  -H "Authorization: Bearer $TOKEN"
```
