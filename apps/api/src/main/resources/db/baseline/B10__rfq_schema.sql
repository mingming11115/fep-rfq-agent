-- Complete RFQ schema for a new MySQL database.
-- Flyway uses this baseline in place of V1 through V10 on an empty database.

-- P0 schema: identity, BU scope, project, document, parsed blocks and requirements.
-- Customer clause numbers are deliberately stored as free text: they may be empty,
-- duplicated or skipped and therefore never act as a primary key.

create table app_user (
    id            varchar(64)  primary key,
    username      varchar(64)  not null unique,
    password_hash varchar(100) not null,
    display_name  varchar(64)  not null,
    email         varchar(128),
    status        varchar(16)  not null default 'ACTIVE',
    system_admin  boolean      not null default false,
    created_at    timestamp    not null default current_timestamp
);

create table business_unit (
    id         varchar(64) primary key,
    code       varchar(32) not null unique,
    name       varchar(64) not null,
    created_at timestamp   not null default current_timestamp
);

-- A user can hold different roles in different BUs; BU scope is the isolation boundary.
create table user_bu_role (
    id         bigint      auto_increment primary key,
    user_id    varchar(64) not null,
    bu_id      varchar(64) not null,
    role       varchar(32) not null,
    status     varchar(16) not null default 'ACTIVE',
    created_at timestamp   not null default current_timestamp,
    constraint uk_user_bu_role unique (user_id, bu_id, role)
);

create table project (
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

create table customer_document (
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
create table document_block (
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

create table parse_run (
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

create table requirement (
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

create table audit_event (
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

-- Older deployments may already have the qualification table; retain those rows.
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

create table project_member (
    project_id varchar(64) not null,
    user_id varchar(64) not null,
    enabled boolean not null default true,
    granted_by varchar(64),
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp,
    primary key (project_id, user_id),
    index idx_project_member_user (user_id, enabled, project_id)
);
-- Preserve ownership, without opening legacy projects to every BU member.
insert into project_member (project_id, user_id, granted_by)
select id, owner_id, created_by from project;

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
create table rfq_demo_seed (
    id varchar(64) primary key,
    initialized_at timestamp null
);

-- Versioned business records. JSON preserves historical response/approval fields per row;
-- no browser workspace or localStorage snapshot is stored here.
create table project_response_config (
 project_id varchar(64) primary key, payload json not null,
 updated_at timestamp not null default current_timestamp
);
create table requirement_response (
 requirement_id varchar(64) primary key, project_id varchar(64) not null,
 payload json not null, updated_at timestamp not null default current_timestamp,
 index idx_response_project (project_id)
);
create table response_review (
 id varchar(128) primary key, project_id varchar(64) not null,
 payload json not null, index idx_review_project (project_id)
);
create table response_snapshot (
 id varchar(128) primary key, project_id varchar(64) not null,
 payload json not null, index idx_snapshot_project (project_id)
);
create table model_definition (
 bu_id varchar(64) not null, id varchar(128) not null, version int not null,
 project_id varchar(64), scope varchar(64), payload json not null,
 primary key (bu_id,id,version)
);
create table process_definition like model_definition;
create table capability_record like model_definition;
create table knowledge_record like model_definition;
create table evidence_record like model_definition;
create table history_document like model_definition;
create table history_clause like model_definition;
create table knowledge_group_catalog (
 bu_id varchar(64) primary key, payload json not null
);

alter table requirement
    add column confirmation_assignee_id varchar(64) null,
    add column confirmation_assigned_by varchar(64) null,
    add column confirmation_assigned_at timestamp(6) null,
    add column confirmation_assignment_reason varchar(900) null;

create table response_confirmation_history (
    requirement_id varchar(64) not null,
    project_id varchar(64) not null,
    kind varchar(16) not null,
    entry_version bigint not null,
    payload json not null,
    primary key (requirement_id, kind, entry_version)
);

update app_user
set display_name = '张明'
where id = 'mysql-demo-sales'
  and username = 'mysql_sr'
  and display_name = '数据库销售';
