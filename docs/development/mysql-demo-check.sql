-- Use the database configured by RFQ_DB_URL. Default: 127.0.0.1:3306/rfq.
-- Read-only checks for the startup fixture; does not touch unrelated records.
select 'BU' as kind, count(*) as total from business_unit where id = 'BU-MYSQL-DEMO'
union all select 'accounts', count(*) from app_user where id like 'mysql-demo-%'
union all select 'projects', count(*) from project where bu_id = 'BU-MYSQL-DEMO'
union all select 'documents', count(*) from customer_document where project_id like 'MYSQL-DEMO-%'
union all select 'requirements', count(*) from requirement where project_id like 'MYSQL-DEMO-%';

select id, code, name, customer, stage, owner_id, deadline
from project where bu_id = 'BU-MYSQL-DEMO' order by code;

select project_id, customer_clause_no, title, original_text, requirement_text, version
from requirement where project_id like 'MYSQL-DEMO-%' order by project_id, sort_order;

select id, initialized_at from rfq_demo_seed where id = 'mysql-business-demo-v1';
-- Full business-record extension (v2), read-only verification.
select id, initialized_at from rfq_demo_seed order by id;
select count(*) as responses from requirement_response;
select count(*) as reviews from response_review;
select count(*) as snapshots from response_snapshot;
select count(*) as models from model_definition;
select count(*) as processes from process_definition;
select count(*) as capabilities from capability_record;
select count(*) as standard_replies from `standard-reply-record`;
select count(*) as evidence_metadata from evidence_record;
select count(*) as history_documents from history_document;
select count(*) as history_clauses from `history-rfq-record`;
