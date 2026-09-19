# Phase 1 — Stabilize

## Objective and exit criteria

Establish a secure, typed, observable application boundary while preserving current inquiry/customer behavior. Phase 1 exits only when critical authorization defects are closed, legacy data access is behind abstractions, migrations are rehearsed, and typecheck/lint/tests/build pass without ignored errors.

## Workstreams and sequence

### 0. Baseline and change control

- Inventory live Sheet tab IDs, headers, formulas, protections, data volume, duplicate/orphan rates, and ownership anomalies.
- Record current workflows and golden test cases; take and verify a restorable Sheet snapshot.
- Add `CONCEPT.md`, `CHANGELOG.md`, architecture decisions, environment template, risk register, and owner/sign-off list.
- Establish staging with separate Supabase project, Sheet, credentials, and provider accounts.

**Gate:** approved inventory/mapping, backup restore evidence, and accepted default permission matrix.

### 1. Quality and test foundation

- Add explicit `typecheck`, unit/integration/E2E test scripts and ESLint configuration compatible with Next.js 16.
- Remove `typescript.ignoreBuildErrors`; replace application `any` with typed DTOs/entities. Keep legacy row values typed as `unknown` until parsed.
- Add test factories and CI gates. Capture existing critical flows before refactoring.

**Tests:** baseline login, inquiry/customer visibility, create/update/delete behavior; mobile smoke viewports.

### 2. Central security boundary

- Implement `requireSession()`, `requireRole()` (compatibility only), `requirePermission()`, `validateRequest()`, `writeAuditLog()`, and `handleApiError()`.
- Add Zod schemas and normalization for email, Indian/E.164 phone, dates, quantity, money, names, IDs, arrays, and pagination.
- Add CSRF token or strict Origin/Fetch-Metadata enforcement for writes, security headers/CSP, correlation IDs, safe structured logging, body/array limits, and no-store controls for sensitive responses.
- Register each API route as public/protected and test the registry.

**Gate:** unauthenticated/forged/CSRF requests fail consistently; no secrets or sensitive message content appear in logs.

### 3. Identity migration

- Configure Supabase Auth, email verification/reset, optional MFA policy, and application user mapping.
- Import identities by normalized email; users set passwords through provider reset/invite. Never migrate plaintext passwords.
- Add revocable application sessions/account disable checks, absolute/idle expiry, rate limiting, progressive lockout, and security audit events.
- Run a staged cohort migration with a time-boxed, feature-flagged legacy login fallback only if operationally necessary; remove fake email token/local storage and dead Forgot Password behavior.

**Gate:** all active users migrated or explicitly scheduled, reset/revocation/disable tested, legacy password sheet access removed from runtime.

### 4. Permission enforcement and critical defect repair

- Seed approved permissions/role grants and team membership. Default unknown users to no access.
- Derive inquiry/customer ownership and communication sender/timestamp from session/server clock.
- Authorize customer/inquiry changes against the persisted record; separate reassignment; preflight entire bulk operations and use transactions where database-backed.
- Protect dropdown, email-log, and WhatsApp-log routes. Rename actions so logging is not presented as sending.
- Add soft delete and restore. During Sheet compatibility, retrieve real sheet metadata, use explicit partial-failure status, and reconciliation markers.

**Authorization tests:** every route × anonymous/EMPLOYEE/HEAD/BOSS × own/team/other; reassignment/field-tampering; bulk mixed-scope rejection; restore/delete.

### 5. Repository and safe Sheet adapter

- Define repositories for users, inquiries, customers, communications, audit, dropdowns, and idempotency; move business logic from `lib/sheets.ts` into services.
- Centralize versioned Sheet schema mappings and header validation; remove hardcoded indexes from UI/service code.
- Use bounded ranges, batch requests, cached dropdowns, metadata-derived tab IDs, retries with jitter, timeouts, and structured integration errors.
- Neutralize `=`, `+`, `-`, `@`, tab/CR formula prefixes and use `RAW` for user values; preserve deliberate formulas through trusted templates only.
- Remove duplicate customer-create route with a compatibility redirect/deprecation period.

**Gate:** repository contract tests and formula-injection tests pass; no UI imports Sheet layouts.

### 6. PostgreSQL operational core and migration seam

- Apply identity/RBAC/audit/idempotency schema first, then minimal company/contact/inquiry tables required to replace risky writes.
- Allocate Inquiry Number and Customer Code with database sequences/functions.
- Add UUIDs, audit metadata, soft delete, version checks, constraints, indexes, and RLS.
- Implement transactional outbox and asynchronous, idempotent Sheet reporting projection with retry/DLQ/monitoring.
- Backfill through staging/quarantine/reconciliation. Use shadow reads and feature flags; do not use uncoordinated dual writes.

**Gate:** concurrency allocation test, optimistic-lock conflict test, migration reconciliation, outbox replay, and rollback rehearsal pass.

### 7. Auditability and operations

- Immutable audit coverage for auth, inquiry/customer changes, ownership, bulk operations, communication, delete/restore, export, permissions, and settings.
- Add protected audit search, liveness/readiness, error tracking, sync status, DLQ operations, alert thresholds, backup/restore and incident runbooks.
- Redact secrets, credentials, raw tokens, message bodies, and unnecessary contact data.

**Gate:** audit completeness/tamper tests and restore exercise pass; operations owners accept dashboards/runbooks.

## Required test suites

- Unit: permissions/scopes, Zod/normalization, Sheet escaping, KPI primitives, stage/scoring helpers introduced in phase.
- API: authentication, CSRF, authorization matrix, validation, error/redaction, idempotency.
- Integration: inquiry/customer create/update/reassign/delete/restore; audit atomicity; outbox behavior.
- Concurrency: parallel identifier creation and optimistic locking.
- Data: duplicate candidates, migration mapping, reconciliation totals.
- E2E: login/reset/logout/revocation, inquiry and customer critical flows, role access, 360/375/768/desktop smoke viewports.
- Gates: `tsc --noEmit`, ESLint, tests, production build; no disabled rules or ignored TypeScript errors.

## Environment changes (planned)

Add server-only Supabase URL/keys, public anon URL/key as appropriate for the selected SSR approach, CSRF/session configuration, rate-limit store credentials, error-tracking DSN, job signing secret, and separate Sheet projection credentials/ID. Exact names will be committed in `.env.example`; secrets must use Vercel encrypted environment storage and be rotated at cutover. Never prefix service-role, Sheet private key, job secret, or provider secret with `NEXT_PUBLIC_`.

## Rollout and rollback

Roll out to staging, internal admins, one HEAD team, then all users. Feature flags select legacy read/database read and protected new writes. Each gate needs reconciled counts/totals and error/latency observation. Rollback disables the new feature flag and workers, preserves committed database/outbox events, and runs reconciliation; never reverse by deleting migrated data.

## Definition of done report

At phase end publish modified files, migration/schema list, exact migration and rollback commands, environment delta, updated CONCEPT and CHANGELOG, test/typecheck/lint/build results, reconciliation evidence, security review results, and remaining risks/owners/dates.

## Explicitly deferred

Full configurable pipeline/task automation/Customer 360 (Phase 2), executive KPI dashboards (Phase 3), downstream lifecycle adapters (Phase 4), and advanced scoring (Phase 5). Phase 1 may add their schema seams but must not ship superficial UI substitutes.
