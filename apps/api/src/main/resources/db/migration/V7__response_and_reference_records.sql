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
