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
