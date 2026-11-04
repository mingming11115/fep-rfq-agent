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
