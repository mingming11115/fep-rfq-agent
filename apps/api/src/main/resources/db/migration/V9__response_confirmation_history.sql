create table response_confirmation_history (
    requirement_id varchar(64) not null,
    project_id varchar(64) not null,
    kind varchar(16) not null,
    entry_version bigint not null,
    payload json not null,
    primary key (requirement_id, kind, entry_version)
);
