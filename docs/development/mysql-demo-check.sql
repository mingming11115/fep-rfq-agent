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
