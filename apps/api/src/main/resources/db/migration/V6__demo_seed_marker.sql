-- Tracks a completed business-table seed; contains no workspace snapshots.
create table rfq_demo_seed (
    id varchar(64) primary key,
    initialized_at timestamp null
);
