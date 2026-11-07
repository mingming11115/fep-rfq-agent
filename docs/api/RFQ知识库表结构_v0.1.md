# RFQ 知识库表结构 v0.1

日期：2026-11-03。范围：现有 Flyway 管理的表结构 + 知识库（历史 RFQ 条款知识）建表草案。

## 一、现有表结构（`apps/api/src/main/resources/db/migration/`）

V1__init.sql 建立身份、BU 隔离、项目、文档、解析与需求抽取共 8 张表；V2__parse_extractor.sql 为 `parse_run` 增加 `extractor` 列（默认 `rule-based-v1`）。改表一律新增迁移脚本，不手改库、不改历史脚本（checksum 校验会失败）。

### app_user（用户）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | varchar(64) PK | |
| username | varchar(64) UNIQUE | 登录名 |
| password_hash | varchar(100) NOT NULL | |
| display_name | varchar(64) NOT NULL | |
| email | varchar(128) | |
| status | varchar(16) DEFAULT 'ACTIVE' | |
| system_admin | boolean DEFAULT false | 平台管理员标记 |
| created_at | timestamp | |

### business_unit（BU）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | varchar(64) PK | |
| code | varchar(32) UNIQUE | |
| name | varchar(64) NOT NULL | |
| created_at | timestamp | |

### user_bu_role（用户×BU×角色）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigint PK 自增 | |
| user_id | varchar(64) NOT NULL | |
| bu_id | varchar(64) NOT NULL | |
| role | varchar(32) NOT NULL | |
| status | varchar(16) DEFAULT 'ACTIVE' | |
| created_at | timestamp | |

唯一约束 `(user_id, bu_id, role)`。一个用户可在不同 BU 持不同角色；BU 是数据隔离边界。

### project（项目）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | varchar(64) PK | |
| code / name | varchar(32) / varchar(200) NOT NULL | |
| customer | varchar(200) | |
| bu_id | varchar(64) NOT NULL | 索引 idx_project_bu |
| owner_id | varchar(64) NOT NULL | 索引 idx_project_owner |
| stage | varchar(32) DEFAULT 'DRAFT' | |
| version | bigint DEFAULT 0 | 乐观锁（updateWithVersion，失败抛 409） |
| created_by / created_at / updated_at | | |

### customer_document（客户文档）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | varchar(64) PK | |
| project_id | varchar(64) NOT NULL | 索引 idx_document_project |
| name | varchar(255) NOT NULL | |
| version | int DEFAULT 1 | |
| purpose | varchar(32) DEFAULT 'REQUIREMENT_SOURCE' | |
| storage_ref | varchar(500) NOT NULL | 原件存储引用 |
| content_type / size_bytes / sha256 | | 同内容识别 |
| status | varchar(24) DEFAULT 'UPLOADED' | |
| uploaded_by / created_at | | |

### document_block（文档读取层：原文与语义抽取之间）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | varchar(64) PK | |
| document_id + block_index | | 联合索引 idx_block_document |
| parent_block_id | varchar(64) | 块层级 |
| type | varchar(24) NOT NULL | 段落/表格等 |
| section_path | varchar(500) | 章节 |
| customer_clause_no | varchar(64) | 客户条款号，刻意为自由文本（可空/重复/跳号，不作主键） |
| content | longtext | |
| source_anchor | varchar(500) | 原文定位 |
| provenance | varchar(24) DEFAULT 'native' | native / ocr |
| processing_status | varchar(24) DEFAULT 'READ' | |

### parse_run（解析任务）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | varchar(64) PK | |
| document_id | varchar(64) NOT NULL | 索引 idx_parse_run_document |
| status | varchar(24) NOT NULL | |
| total_blocks / processed_blocks / requirement_count / issue_count | int | 进度与结果统计 |
| message | varchar(1000) | |
| started_at / finished_at / created_by | | |
| extractor | varchar(255) DEFAULT 'rule-based-v1' | V2 新增 |

### requirement（抽取出的需求条款）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | varchar(64) PK | |
| project_id / document_id / parse_run_id / block_id | | 归属链路 |
| section_path | varchar(500) | |
| customer_clause_no | varchar(64) | 自由文本 |
| title / level / parent_id | | 层级结构 |
| original_text / requirement_text | longtext | 原文与规整后的要求 |
| metrics_json | longtext | 指标 |
| conditions_text | varchar(1000) | |
| obligation | varchar(24) | |
| extraction_status | varchar(24) DEFAULT 'VALID' | |
| review_reasons | varchar(1000) | |
| sort_order | int | 索引 idx_requirement_project (project_id, sort_order) |
| version | bigint DEFAULT 0 | 乐观锁 |
| created_at | timestamp | |

### audit_event（审计事件）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | varchar(64) PK | |
| actor_id / action | | |
| object_type / object_id | | |
| result | varchar(16) | |
| detail | varchar(1000) | |
| created_at | timestamp | 索引 idx_audit_created |

## 二、知识库表草案（V3，尚未落库）

原型阶段，历史 RFQ 条款知识的文档元数据、条款与审核存于浏览器 localStorage（`rfq.history.documents.v1` / `rfq.reference.knowledge.v1`），原件存于 IndexedDB。以下草案描述将这部分数据迁移到共享后端知识库所需的表结构。

设计要点：

- `requirement` 表服务"新 RFQ 解析"，与知识库条款是两条业务，不共用。
- 客户条款号（原编号）保持自由文本：可空、可重复、可跳号；重复或无编号的条款保留为异常，人工关联。
- 同一原编号构成版本链 `(bu_id, clause_no, version)`；审核规则沿用"同版本不得自审"（`reviewer_id != submitter_id`）与现有知识发布权限。
- 重新解析按 `source_anchor` 定位合并，保留人工修改与已提交/发布版本，不静默删除旧条款。
- 同 BU 同内容（sha256）重复上传提示打开已有文档。
- 审核流水复用 `audit_event`（`object_type='KNOWLEDGE_CLAUSE'`），不另建表。

```sql
-- V3__history_knowledge.sql（草案，未提交迁移目录）

-- 历史RFQ文档（一份文档关联多条知识）
create table history_document (
    id            varchar(64)  primary key,
    bu_id         varchar(64)  not null,                    -- 隔离边界
    customer      varchar(200),
    project_name  varchar(200),
    model_name    varchar(200),                             -- 机型
    config_text   varchar(500),                             -- 配置
    doc_date      date,
    file_version  varchar(32),
    visibility    varchar(16)  not null default 'BU',       -- 可见范围
    file_name     varchar(255) not null,
    storage_ref   varchar(500) not null,                    -- 原件存储（替代 IndexedDB）
    content_type  varchar(128),
    size_bytes    bigint       not null default 0,
    sha256        varchar(64),
    parse_status  varchar(16)  not null default 'PENDING',  -- PENDING/PARTIAL/COMPLETE
    issues_json   longtext,                                 -- 异常块
    uploaded_by   varchar(64)  not null,
    created_at    timestamp    not null default current_timestamp,
    updated_at    timestamp    not null default current_timestamp,
    index idx_hdoc_bu (bu_id),
    unique key uk_hdoc_sha (bu_id, sha256)
);

-- 配套答复文件（一文档可多附件）
create table history_attachment (
    id            varchar(64)  primary key,
    document_id   varchar(64)  not null,
    file_name     varchar(255) not null,
    storage_ref   varchar(500) not null,
    sha256        varchar(64),
    created_at    timestamp    not null default current_timestamp,
    index idx_hatt_doc (document_id)
);

-- 条款知识（核心表：同一原编号构成版本链）
create table knowledge_clause (
    id                varchar(64)  primary key,
    document_id       varchar(64)  not null,
    bu_id             varchar(64)  not null,
    clause_no         varchar(64),                          -- 原编号（可空，空/重复走异常）
    section_path      varchar(500),                         -- 章节
    requirement_text  longtext,                             -- 客户要求
    answer_conclusion longtext,                             -- 历史答复-结论
    answer_note       longtext,                             -- 历史答复-说明
    conditions_text   varchar(1000),                        -- 适用条件与限制
    source_anchor     varchar(500),                         -- 原文定位
    evidence_json     longtext,                             -- 证据
    customer_feedback varchar(1000),                        -- 客户反馈/验收结果
    status            varchar(16)  not null default 'DRAFT',-- DRAFT/PENDING_REVIEW/PUBLISHED
    version           int          not null default 1,
    submitter_id      varchar(64)  not null,
    reviewer_id       varchar(64),                          -- 同版本不得自审
    submitted_at      timestamp,
    reviewed_at       timestamp,
    created_at        timestamp    not null default current_timestamp,
    updated_at        timestamp    not null default current_timestamp,
    index idx_kc_doc (document_id),
    index idx_kc_bu_status (bu_id, status),
    index idx_kc_clause (bu_id, clause_no, version)
);
```

## 三、配套说明

- 文档列表页搜索条款：按 `knowledge_clause` 的 requirement_text / answer_conclusion / clause_no 检索，命中后回链 `history_document`。
- 解析状态（文档级 parse_status）与条款审核状态（条款级 status）分别展示，与原型行为一致。
- 缺答复（answer_conclusion 为空）允许保存草稿，批量提交时校验拦截。
- 本草案未包含共享知识服务的接口与前端改造，落地时另行评审。
