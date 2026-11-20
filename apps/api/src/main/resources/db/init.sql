-- Complete RFQ schema for a new MySQL database.
-- On first startup, the backend applies the schema before loading the optional demo data.

-- P0 schema: identity, BU scope, project, document, parsed blocks and requirements.
-- Customer clause numbers are deliberately stored as free text: they may be empty,
-- duplicated or skipped and therefore never act as a primary key.

create table if not exists app_user (
    id            varchar(64)  primary key,
    username      varchar(64)  not null unique,
    password_hash varchar(100) not null,
    display_name  varchar(64)  not null,
    email         varchar(128),
    status        varchar(16)  not null default 'ACTIVE',
    system_admin  boolean      not null default false,
    created_at    timestamp    not null default current_timestamp
);

create table if not exists business_unit (
    id         varchar(64) primary key,
    code       varchar(32) not null unique,
    name       varchar(64) not null,
    created_at timestamp   not null default current_timestamp
);

-- A user can hold different roles in different BUs; BU scope is the isolation boundary.
create table if not exists user_bu_role (
    id         bigint      auto_increment primary key,
    user_id    varchar(64) not null,
    bu_id      varchar(64) not null,
    role       varchar(32) not null,
    status     varchar(16) not null default 'ACTIVE',
    created_at timestamp   not null default current_timestamp,
    constraint uk_user_bu_role unique (user_id, bu_id, role)
);

create table if not exists project (
    id         varchar(64)  primary key,
    code       varchar(32)  not null,
    name       varchar(200) not null,
    customer   varchar(200),
    bu_id      varchar(64)  not null,
    owner_id   varchar(64)  not null,
    stage      varchar(32)  not null default 'DRAFT',
    version    bigint       not null default 0,
    created_by varchar(64),
    created_at timestamp    not null default current_timestamp,
    updated_at timestamp    not null default current_timestamp
);
create index idx_project_bu on project (bu_id);
create index idx_project_owner on project (owner_id);

create table if not exists customer_document (
    id           varchar(64)  primary key,
    project_id   varchar(64)  not null,
    name         varchar(255) not null,
    version      int          not null default 1,
    purpose      varchar(32)  not null default 'REQUIREMENT_SOURCE',
    storage_ref  varchar(500) not null,
    content_type varchar(128),
    size_bytes   bigint       not null default 0,
    sha256       varchar(64),
    status       varchar(24)  not null default 'UPLOADED',
    uploaded_by  varchar(64)  not null,
    created_at   timestamp    not null default current_timestamp
);
create index idx_document_project on customer_document (project_id);

-- Reading layer between the raw file and semantic extraction.
create table if not exists document_block (
    id                  varchar(64)  primary key,
    document_id         varchar(64)  not null,
    block_index         int          not null,
    parent_block_id     varchar(64),
    type                varchar(24)  not null,
    section_path        varchar(500),
    customer_clause_no  varchar(64),
    content             longtext,
    source_anchor       varchar(500),
    provenance          varchar(24)  not null default 'native',
    processing_status   varchar(24)  not null default 'READ'
);
create index idx_block_document on document_block (document_id, block_index);

create table if not exists parse_run (
    id               varchar(64)  primary key,
    document_id      varchar(64)  not null,
    status           varchar(24)  not null,
    total_blocks     int          not null default 0,
    processed_blocks int          not null default 0,
    requirement_count int         not null default 0,
    issue_count      int          not null default 0,
    message          varchar(1000),
    started_at       timestamp,
    finished_at      timestamp,
    created_by       varchar(64)
);
create index idx_parse_run_document on parse_run (document_id);

create table if not exists requirement (
    id                varchar(64)  primary key,
    project_id        varchar(64)  not null,
    document_id       varchar(64)  not null,
    parse_run_id      varchar(64),
    block_id          varchar(64),
    section_path      varchar(500),
    customer_clause_no varchar(64),
    title             varchar(300),
    level             int          not null default 1,
    parent_id         varchar(64),
    original_text     longtext,
    requirement_text  longtext,
    metrics_json      longtext,
    conditions_text   varchar(1000),
    obligation        varchar(24),
    extraction_status varchar(24)  not null default 'VALID',
    review_reasons    varchar(1000),
    sort_order        int          not null default 0,
    version           bigint       not null default 0,
    created_at        timestamp    not null default current_timestamp
);
create index idx_requirement_project on requirement (project_id, sort_order);
create index idx_requirement_document on requirement (document_id);

create table if not exists audit_event (
    id          varchar(64)  primary key,
    actor_id    varchar(64),
    action      varchar(64),
    object_type varchar(32),
    object_id   varchar(64),
    result      varchar(16),
    detail      varchar(1000),
    created_at  timestamp    not null default current_timestamp
);
create index idx_audit_created on audit_event (created_at);

alter table parse_run add column extractor varchar(255) not null default 'rule-based-v1';

create table if not exists bu_member_profile (
    id bigint auto_increment primary key,
    user_id varchar(64) not null,
    bu_id varchar(64) not null,
    can_confirm boolean not null default false,
    can_final_review boolean not null default false,
    resource_qualifications varchar(500) not null default '',
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp,
    constraint uk_bu_member_profile unique (user_id, bu_id)
);
-- Membership suspension is separate from role revocation: enabling a member
-- must never resurrect a previously revoked role.
alter table bu_member_profile add column enabled boolean not null default true;

create table if not exists project_member (
    project_id varchar(64) not null,
    user_id varchar(64) not null,
    enabled boolean not null default true,
    granted_by varchar(64),
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp,
    primary key (project_id, user_id),
    index idx_project_member_user (user_id, enabled, project_id)
);
alter table audit_event add column bu_id varchar(64);
create index idx_audit_bu_created on audit_event (bu_id, created_at, id);

alter table project
    add column deadline date,
    add column archived_from_stage varchar(32),
    add column archived_at timestamp null,
    add column archived_by varchar(64),
    add column archive_reason varchar(500);
create index idx_project_stage_created on project (stage, created_at, id);

-- Do not renumber historical originals: duplicated versions must be reconciled
-- before this migration, rather than silently changing source provenance.
create unique index uk_document_project_version on customer_document (project_id, version);

-- Tracks a completed business-table seed; contains no workspace snapshots.
create table if not exists rfq_demo_seed (
    id varchar(64) primary key,
    initialized_at timestamp null
);

-- Versioned business records. JSON preserves historical response/approval fields per row;
-- no browser workspace or localStorage snapshot is stored here.
create table if not exists project_response_config (
 project_id varchar(64) primary key, payload json not null,
 updated_at timestamp not null default current_timestamp
);
create table if not exists requirement_response (
 requirement_id varchar(64) primary key, project_id varchar(64) not null,
 payload json not null, updated_at timestamp not null default current_timestamp,
 index idx_response_project (project_id)
);
create table if not exists response_review (
 id varchar(128) primary key, project_id varchar(64) not null,
 payload json not null, index idx_review_project (project_id)
);
create table if not exists response_snapshot (
 id varchar(128) primary key, project_id varchar(64) not null,
 payload json not null, index idx_snapshot_project (project_id)
);
create table if not exists model_definition (
 bu_id varchar(64) not null, id varchar(128) not null, version int not null,
 project_id varchar(64), scope varchar(64), payload json not null,
 primary key (bu_id,id,version)
);
create table if not exists process_definition like model_definition;
create table if not exists capability_record like model_definition;
create table if not exists knowledge_record like model_definition;
create table if not exists evidence_record like model_definition;
create table if not exists history_document like model_definition;
create table if not exists history_clause like model_definition;
create table if not exists knowledge_group_catalog (
 bu_id varchar(64) primary key, payload json not null
);

alter table requirement
    add column confirmation_assignee_id varchar(64) null,
    add column confirmation_assigned_by varchar(64) null,
    add column confirmation_assigned_at timestamp(6) null,
    add column confirmation_assignment_reason varchar(900) null;

-- RFQ_MIGRATION_V11
-- Retain original history versions. A same-key record with different content
-- remains available as a separate draft for reconciliation.


delete from knowledge_record where json_unquote(json_extract(payload,'$.type'))='history';

rename table knowledge_record to `standard-reply-record`, history_clause to `history-rfq-record`;
alter table `standard-reply-record` add column revision bigint not null default 0;

create table if not exists standard_reply_index_sync (
    bu_id varchar(64) not null,
    reply_id varchar(128) not null,
    version int not null,
    operation varchar(8) not null,
    payload json,
    updated_at datetime(6) not null,
    next_attempt_at datetime(6) not null default current_timestamp(6),
    lease_token varchar(64),
    lease_until datetime(6),
    attempts int not null default 0,
    last_error varchar(255),
    job_id varchar(255),
    synced_at datetime(6),
    primary key (bu_id, reply_id),
    index idx_standard_reply_index_due (bu_id, synced_at, next_attempt_at)
);
-- RFQ_MIGRATION_V11_END

-- RFQ_MIGRATION_V12
alter table history_document
    add column fingerprint varchar(255),
    add column originals json,
    add unique key uk_history_document_fingerprint (bu_id, fingerprint);
alter table `history-rfq-record` add column revision bigint not null default 0;
create table if not exists history_rfq_index_sync like standard_reply_index_sync;
-- RFQ_MIGRATION_V12_END

-- RFQ_MIGRATION_V13
alter table capability_record
    add column revision bigint not null default 0,
    add column source_fingerprint varchar(255),
    add unique key uk_capability_source (bu_id, source_fingerprint);
alter table evidence_record add column revision bigint not null default 0;
-- RFQ_MIGRATION_V13_END

-- RFQ_MIGRATION_V14
create table if not exists bu_match_policy (
    bu_id varchar(64) primary key,
    match_order json not null,
    version bigint not null,
    changed_by varchar(64) not null,
    changed_at datetime(6) not null
);
create table if not exists requirement_match_input (
    requirement_id varchar(64) primary key,
    source_fingerprint char(64) not null,
    version bigint not null,
    payload json not null
);
create table if not exists requirement_match_run (
    id varchar(64) primary key,
    bu_id varchar(64) not null,
    project_id varchar(64) not null,
    requirement_id varchar(64) not null,
    requirement_version bigint not null,
    document_id varchar(64) not null,
    document_version int not null,
    parse_run_id varchar(64),
    input_fingerprint char(64) not null,
    policy_version bigint not null,
    match_order json not null,
    input_snapshot json not null,
    request_key varchar(80) not null,
    trigger_reason varchar(24) not null,
    current_run tinyint,
    status varchar(24) not null,
    attempts int not null default 0,
    next_attempt_at datetime(6),
    lease_until datetime(6),
    lease_token varchar(64),
    progress json,
    created_at datetime(6) not null default current_timestamp(6),
    unique key uk_match_current (requirement_id, current_run),
    unique key uk_match_request (requirement_id, request_key),
    index idx_match_due (next_attempt_at, status, lease_until),
    index idx_match_project (project_id, document_id, parse_run_id, current_run)
);
create table if not exists requirement_match_result (
    run_id varchar(64) primary key,
    scope_stamp json not null,
    payload json not null,
    completed_at datetime(6) not null default current_timestamp(6)
);
-- RFQ_MIGRATION_V14_END

-- RFQ_MIGRATION_V15
create table if not exists project_work_version (
    project_id varchar(64) primary key,
    work_version bigint not null default 1,
    created_at timestamp(6) not null default current_timestamp(6)
);
-- RFQ_MIGRATION_V15_END

-- RFQ_MIGRATION_V16
create table if not exists rfq_document_replacement (
    project_id varchar(64) not null,
    old_document_id varchar(64) not null,
    new_document_id varchar(64) primary key,
    status varchar(16) not null,
    work_version bigint,
    created_by varchar(64) not null,
    created_at timestamp(6) not null default current_timestamp(6),
    activated_by varchar(64),
    activated_at timestamp(6),
    reason varchar(900),
    index idx_replacement_scope (project_id,status,old_document_id)
);
-- RFQ_MIGRATION_V16_END

-- RFQ_MIGRATION_V17
alter table project
    add column group_id varchar(128) null,
    add column group_path varchar(1024) null,
    add column group_catalog_version bigint null,
    add column group_values json null;
-- RFQ_MIGRATION_V17_END

-- RFQ_MIGRATION_V18
alter table customer_document add column history_document_ids varchar(1299) null;
-- RFQ_MIGRATION_V18_END

-- RFQ_MIGRATION_V19
-- Each requirement has its own source excerpt so rows from one table keep their original order.

update requirement r join document_block b on b.id = concat('REQSRC-', left(sha2(r.id, 256), 48))
set r.block_id = b.id;

update requirement
set requirement_text = concat_ws(char(10), nullif(coalesce(requirement_text, original_text), ''),
    concat('适用条件：', trim(conditions_text)))
where nullif(trim(conditions_text), '') is not null
  and locate(trim(conditions_text), coalesce(requirement_text, original_text, '')) = 0;

update requirement_response
set payload = json_remove(
    case when json_type(json_extract(payload, '$.conditions')) = 'STRING'
        and nullif(trim(payload->>'$.conditions'), '') is not null
        and locate(concat('适用条件：', trim(payload->>'$.conditions')), coalesce(payload->>'$.draft', '')) = 0
      then json_set(payload, '$.draft', concat_ws(char(10), nullif(payload->>'$.draft', ''),
        concat('适用条件：', trim(payload->>'$.conditions'))))
      else payload end,
    '$.conditions');

alter table requirement drop index idx_requirement_project,
    drop column parent_id, drop column level, drop column conditions_text, drop column obligation,
    drop column sort_order, add index idx_requirement_project (project_id);
-- RFQ_MIGRATION_V19_END

-- RFQ_MIGRATION_V20
update requirement_response
set payload = json_remove(
    case when json_type(json_extract(payload, '$.remark')) = 'STRING' then payload
         else json_set(payload, '$.remark', json_extract(payload, '$.reason')) end,
    '$.reason')
where json_contains_path(payload, 'one', '$.reason');
-- RFQ_MIGRATION_V20_END

-- RFQ_MIGRATION_V21
alter table history_document
    add column parse_due_at datetime(6) null,
    add column parse_token varchar(36) null,
    add index idx_history_parse_due (parse_due_at);
-- RFQ_MIGRATION_V21_END

-- RFQ_MIGRATION_V22
alter table requirement add column source_refs_json json;
-- RFQ_MIGRATION_V22_END

-- RFQ_MIGRATION_V23
create table if not exists capability_index_sync like standard_reply_index_sync;
-- RFQ_MIGRATION_V23_END

-- RFQ_MIGRATION_V24
update requirement set extraction_status='VALID' where extraction_status='NEEDS_REVIEW';
-- RFQ_MIGRATION_V24_END

-- RFQ_MIGRATION_V25
-- Word 模型解析的批次执行记录：每个模型请求批次一行，用于排查分批解析的成败与覆盖范围。
create table if not exists parse_batch (
    id              varchar(64)  primary key,
    parse_run_id    varchar(64)  not null,
    batch_index     int          not null,
    status          varchar(24)  not null,
    primary_sources varchar(500),
    content_chars   int          not null default 0,
    failure_reason  varchar(500),
    created_at      timestamp    not null default current_timestamp
);
create index idx_parse_batch_run on parse_batch (parse_run_id);
-- RFQ_MIGRATION_V25_END

-- RFQ_MIGRATION_V26
-- 项目级比对策略：顺序、分库相似度阈值、分库开关；无记录时沿用 BU 默认顺序与系统阈值。
create table if not exists project_match_policy (
    project_id varchar(64) primary key,
    match_order json not null,
    similarity json not null,
    enabled json not null,
    version bigint not null,
    changed_by varchar(64) not null,
    changed_at datetime(6) not null
);
-- 每轮比对沿用创建时的阈值，避免策略调整改写已完成轮次的判定口径。
alter table requirement_match_run add column match_thresholds json null;
-- RFQ_MIGRATION_V26_END

-- RFQ_MIGRATION_V27
-- 应答状态细化为「待处理 / 评审中 / 已确认」，由服务端与评审写入同事务维护；存量的「待确认」统一改为「待处理」。
update requirement_response set payload=json_set(payload,'$.status','待处理')
where json_unquote(json_extract(payload,'$.status'))='待确认';
-- 已挂未关闭评审事项的应答直接置为「评审中」，与界面原先的派生口径对齐。
update requirement_response rr join response_review rv
    on rv.project_id=rr.project_id
   and json_unquote(json_extract(rv.payload,'$.requirementId'))=rr.requirement_id
set rr.payload=json_set(rr.payload,'$.status','评审中')
where json_unquote(json_extract(rr.payload,'$.status'))='待处理'
  and json_unquote(json_extract(rv.payload,'$.status')) not in ('已关闭','已取消');
-- RFQ_MIGRATION_V27_END

-- RFQ_MIGRATION_V28
-- 历史数据里的「待复核」同属未确认，统一归为「待处理」；是否需复核由 needsReview / sourceRevision 表达。
update requirement_response set payload=json_set(payload,'$.status','待处理')
where json_unquote(json_extract(payload,'$.status'))='待复核';
-- RFQ_MIGRATION_V28_END


-- 演示文档表结构：DemoDocumentMapper 依赖它（只建表，不灌演示数据）
CREATE TABLE IF NOT EXISTS rfq_demo_document (
    id varchar(64) primary key,
    content longblob not null
);
