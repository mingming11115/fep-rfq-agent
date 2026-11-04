alter table project
    add column deadline date,
    add column archived_from_stage varchar(32),
    add column archived_at timestamp null,
    add column archived_by varchar(64),
    add column archive_reason varchar(500);
create index idx_project_stage_created on project (stage, created_at, id);
