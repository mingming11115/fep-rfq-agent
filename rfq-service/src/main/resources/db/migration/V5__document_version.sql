-- Do not renumber historical originals: duplicated versions must be reconciled
-- before this migration, rather than silently changing source provenance.
create unique index uk_document_project_version on customer_document (project_id, version);
