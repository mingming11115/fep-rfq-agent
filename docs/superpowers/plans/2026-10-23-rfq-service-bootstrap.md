# RFQ Service Bootstrap Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the application and test cycle; deployment documentation can be authored independently.

**Goal:** Create the independently deployable RFQ Spring Boot backend framework requested by the user.

**Architecture:** A standalone Maven application in `rfq-service`, with no dependency on the existing Naura application. Include Spring MVC, Bean Validation, Actuator, a common JSON response and exception handling, and container deployment support.

**Tech Stack:** Java 17, Spring Boot 3.5.9 (matching the existing backend), Maven, Docker.

**Spec:** User-approved scope in this conversation: independent RFQ backend, backend framework only.

## Global Constraints

- Default port: `48081`; profile defaults to `local` and supports `prod`.
- No RFQ business APIs, database/Redis dependencies, authentication implementation, or model integration in this stage.
- Business API envelope: `{code, msg, data}`, success code `0`; Actuator retains its standard response.
- Only health and application info management endpoints are exposed; health details stay hidden.
- Preserve existing projects and uncommitted changes. Create the standalone directory in the requested workspace; no extra worktree or Git repository is needed for this scaffold.

## Review Focus

- Application must start without external infrastructure.
- Validation errors and malformed JSON must retain HTTP 400 and use the common envelope.
- Missing routes and unsupported methods must retain HTTP 404/405, including framework response headers.
- Unexpected errors must not expose exception details in HTTP responses.
- Docker build, jar name, container port, and documented startup commands must agree.

### Task 1: Runnable backend and error contracts

**Files:** `apps/api/pom.xml`, `src/main/java/com/naura/rfq/**`, `src/main/resources/application*.yml`, `src/test/java/com/naura/rfq/**`.

**Interfaces:** Produces `RfqServiceApplication`, `ApiResponse<T>`, `BusinessException`, and `GlobalExceptionHandler`; HTTP health at `/actuator/health` and info at `/actuator/info`.

- [x] Create Maven dependencies, the startup class, and focused integration tests first.
- [x] Run tests before the exception handler and verify the missing implementation failure.
- [x] Implement the response envelope and exception handling; run the complete project tests.

### Task 2: Independent deployment and documentation

**Files:** `apps/api/Dockerfile`, `compose.yaml`, `.env.example`, `.gitignore`, `.dockerignore`, `README.md`.

**Interfaces:** Consumes a Maven build producing `target/rfq-service.jar`; exposes container port `48081` and supports `SPRING_PROFILES_ACTIVE` and `JAVA_TOOL_OPTIONS`.

- [x] Create a multi-stage Docker build and a Compose service with an independently configurable host port.
- [x] Document Docker and local Maven startup, health checks, project structure, and current scope in Chinese.
- [x] Build and start the container; verify health/info over HTTP and stop the verification container.
- [x] Obtain a fresh code review and address substantive findings; record final verification results below.

## Verification results

- Initial red run: 11 tests executed; 5 assertions failed and 2 unhandled exceptions occurred because the global handler was absent. The startup/management checks and response serialization passed.
- Maven `verify`: 11 tests passed, executable `target/rfq-service.jar` produced.
- Exact multi-stage Dockerfile build: succeeded on JDK 17.0.15; all 11 tests passed again. Existing downloaded dependencies were copied into the temporary BuildKit cache to avoid duplicate network downloads; no validation-only files were added to the project.
- Compose configuration validation: passed.
- Container smoke check: Java 17.0.20.1, `prod`, port `48081`, runtime user `10001:10001`.
- HTTP checks: health returned exactly `{"status":"UP"}`; info returned `rfq-service`; environment management endpoint, unknown route and test-only route returned HTTP 404 with the expected error envelope.
- Packaged application classes use class-file version 61 (Java 17); no test or probe classes were packaged.
- Fresh read-only code review found no Critical or Important issues.
- Verification container and its dedicated Compose network were stopped and removed; the reusable application image remains `rfq-service:local`.
