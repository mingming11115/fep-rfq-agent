alter table requirement
    add column confirmation_assignee_id varchar(64) null,
    add column confirmation_assigned_by varchar(64) null,
    add column confirmation_assigned_at timestamp(6) null,
    add column confirmation_assignment_reason varchar(900) null;
