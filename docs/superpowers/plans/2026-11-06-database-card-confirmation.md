# Database card confirmation

**Goal:** Persist draft edits and card confirmation in MySQL using existing assignments, project access and response versions.

**Design:** Add dedicated response PATCH and confirm POST endpoints. Serialize writes with the existing project/document lock order, check both source and response versions, preserve server-owned assignment/review fields, reject open reviews and audit successful writes in the same transaction. Default confirmation belongs to the project owner; explicit assignments take precedence. Existing review-owned cards remain blocked until their workflow is supported. The React view awaits server success before clearing input or advancing.

- [x] Add failing service tests for authorization, stale versions, validation and persistence.
- [x] Implement transactional response service and API routes.
- [x] Enable only response save/confirm in database permissions and await writes in the card view.
- [x] Run focused backend/frontend tests and production build; update running local backend and verify actual APIs.

Validation: 16 backend tests (including opt-in MySQL transaction rollback persistence check), 24 focused web tests and production build passed. Current checkout now serves local ports 5173/48084. Live mysql_sr login and database workspace load succeeded; stale confirmation returns HTTP 409. Test writes were rolled back.

Browser verification: mysql_sr sees an enabled Confirm button on MYSQL-DEMO-001-REQ-1 with zero page errors. Full web suite was attempted but did not finish; only focused test results are claimed. Shared-review confirmation stays blocked until its dedicated server workflow is implemented.
