# MinIO storage implementation plan

**Goal:** Add RFQ_STORAGE_TYPE=local|minio, default local; preserve access to existing files without migration.
**Architecture:** DocumentStorage retains upload validation and local legacy references. MinIO references carry bucket and object key. A closeable file lease stages remote objects for existing readers and cleans temporary files. Downloads use verified bytes within the lease.
**Tech Stack:** Java 17, Spring Boot, MinIO Java SDK, JUnit/Mockito.
**Spec:** User approved configuration switch and old-file compatibility in chat on 2026-11-04.

## Constraints and review focus
Reuse current checkout; preserve existing frontend edits; no commits or deployment. Credentials only via environment. Private bucket must already exist. No fallback to local after remote failures. Scope is RFQ original documents, not OnlyOffice storage.

- [x] Add failing tests for remote roundtrip, local/remote switching, temporary cleanup, corruption, invalid input and upload failures.
- [x] Add configured MinIO adapter and reference routing in DocumentStorage; retain legacy constructor and local behavior.
- [x] Adapt parsing/download lifetime, document environment configuration and limitations.
- [x] Run focused tests and compile; record actual results and any environment limitations.

## Verification

RED: Maven test compilation failed because MinioObjectStore did not exist.
GREEN: Maven `-Dtest=DocumentStorageTest,MinioDocumentStorageTest,MinioObjectStoreTest test`: BUILD SUCCESS, 11 tests, zero failures/errors/skips. SDK adapter exercised against a local HTTP server checking signed PUT/GET/DELETE; storage routing exercised with a mocked adapter. Production and test sources compiled with Java 17.
Review found HistoryParseController also used DocumentStorage.resolve; adapted it to a closeable lease. No frontend changes made by this task. No real MinIO endpoint/credentials were supplied; no supplier or database integration tests run. Download buffers at most the existing 30 MiB file limit in memory. Remote objects retain bucket/key references, not endpoint identities.
