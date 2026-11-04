# Real RFQ upload and parsing UI

User requested direct implementation of real upload/parse wiring. Preserve current checkout and unrelated edits.

Implemented rfqSourceClient: validate backend project access, multipart upload, parse-runs request, paginated requirements query filtered by backend document ID, count consistency check, frontend row mapping without invented answers.

SourceUploadDialog uploads to RFQ before retaining the existing Craft review upload. Upload result keeps backend document/project identity separately from UI file identity. App navigates to documents after upload. DocumentsPage uses actual parse responses and persisted requirements; timed extraction and makeRequirements fallback removed from scheduleParse. Legacy files lacking backend identity must be reuploaded. Explicit demo loading remains a separate action.

Verification: first client test failed because module was absent; implementation passed 13 client/project/Craft regression tests. Vite production build passed (19.18s), with existing chunk size notices. Browser integration not executed. Existing backend real HTTP upload/parse/SQL test was verified separately in the previous task; this record does not claim browser-to-database acceptance.

Limitations: backend login and an existing authorized backend project with the current project ID are required. Frontend-only newly created projects are not automatically provisioned on backend; fail explicitly rather than guessing mappings. Craft upload remains a separate request, so its failure can leave an RFQ original already uploaded. No real MinIO/model-provider acceptance in this change.
