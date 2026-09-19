# Target Architecture

## Architecture principles

1. PostgreSQL is the transactional system of record; Google Sheets is a reporting/export projection.
2. Identity, authentication, authorization, and record ownership are server-derived.
3. Business rules live in services/domain policies, not React components or Sheet positions.
4. Every mutation is validated, authorized, auditable, idempotent where appropriate, and concurrency-safe.
5. Integrations exchange stable UUIDs/external references and do not duplicate operational truth.
6. Security is layered: provider authentication, application permissions, PostgreSQL RLS, constraints, audit logs, and monitoring.

## Logical components

```text
Browser
  -> Next.js UI / Server Components
  -> Route Handlers (CSRF + validation + session + permission)
  -> Application Services (workflow, ownership, scoring, KPI rules)
  -> Repositories
       -> Supabase PostgreSQL + RLS (system of record)
       -> Transactional outbox
  -> Worker / scheduled jobs
       -> Google Sheets reporting projection
       -> email / approved WhatsApp providers
       -> BrownWall costing/order/production/payment adapters
       -> retries, dead-letter queue, sync status
```

## Recommended code boundaries

```text
app/api/                 thin HTTP adapters
lib/auth/                requireSession, session/revocation, CSRF
lib/authorization/       requireRole, requirePermission, scope policies
lib/validation/          Zod schemas and validateRequest
lib/errors/              typed errors and handleApiError
lib/audit/               immutable writeAuditLog
lib/domain/              entities, pipeline/SLA/scoring/KPI policy
lib/services/            use cases and transactions
lib/repositories/        interfaces
lib/repositories/db/     PostgreSQL implementations
lib/integrations/sheets/ compatibility/export adapter and schema maps
lib/integrations/*/      provider adapters
lib/jobs/                outbox consumers, retries, DLQ
```

UI code receives typed DTOs and never imports a Sheet client or depends on column positions.

## Identity and session design

- Prefer Supabase Auth with verified email identities and provider-managed password hashing/reset/MFA capabilities.
- Map `auth.users.id` to `public.users.id`; temporarily match normalized email to legacy `UserRoles` during migration, then move role/team assignments to PostgreSQL.
- Use secure HttpOnly cookies, `SameSite=Lax` or `Strict` as workflow permits, `Secure` in production, explicit path, absolute and idle expiry.
- Track application sessions (`id`, user, issued/last-seen/expires/revoked timestamps, hashed refresh/session identifier, device metadata). Recheck user active status and authorization-sensitive version.
- Revoke all sessions on disable, credential compromise, or permission-critical events.
- Rate-limit login by normalized account and privacy-preserving network key; apply progressive delay and temporary lockout without revealing account existence.

## Request pipeline

All non-public API routes use this order:

1. correlation/request ID and structured context;
2. security headers and allowed-origin/CSRF verification for writes;
3. `requireSession()`;
4. `validateRequest(schema)`;
5. `requirePermission(permission, resourceContext)`;
6. service transaction with optimistic locking/idempotency;
7. `writeAuditLog()` in the same transaction;
8. consistent response or `handleApiError()` with masked logs.

Only login, callback/reset endpoints, and a minimal liveness endpoint are public by explicit registry.

## Authorization model

- Permissions are grants through roles plus narrowly scoped user overrides.
- Data scope (`own`, `team`, `all`) is evaluated from persisted ownership/team membership, not request payloads.
- Reassignment is a separate permission and audited action with a mandatory reason.
- PostgreSQL RLS mirrors essential read/write scopes as defense in depth; service-role credentials never reach the browser.
- Deny by default. Unknown/inactive users receive no access.

## Transaction and concurrency model

- UUID primary keys are immutable. Inquiry Number and Customer Code are unique business identifiers allocated by PostgreSQL sequences/functions in the creation transaction.
- `row_version` increments on update; clients submit `expected_version`. A mismatch returns `409 Conflict` with current metadata.
- Stage change, history, required task creation, outbox messages, and audit event commit atomically.
- Delete is soft delete. Restore clears deletion metadata under permission. Hard purge is a separately approved retention job.
- Idempotency records bind key + actor + operation + request hash to a stored result.

## Google Sheets transition

Phase 1 introduces typed column maps, metadata lookup for actual tab IDs, formula-neutralization, `RAW` input for user values, bounded reads, batch operations, retries, and explicit partial-failure responses. During database migration, dual-write is avoided: commit PostgreSQL plus an outbox event, then asynchronously project to Sheets. Jobs are idempotent by entity/version, expose lag and last error, and move exhausted attempts to a DLQ. Reconciliation compares IDs, versions, counts, and critical totals.

## Pipeline and automation

Stages are data-driven: probability, SLA, required fields, allowed successors, allowed permissions, and closure requirements. A transition service locks the inquiry, validates policy, writes stage history, updates SLA deadlines, creates tasks/outbox events, and audits factors. Scheduled workers generate digest/escalation notifications with deduplication and quiet-hour policies.

## Observability and operations

- Structured JSON logs with correlation ID, actor ID, action, entity ID, result, duration; no secrets or message bodies by default.
- Error tracking plus metrics for latency/error rate, authorization denials, login abuse, outbox lag, DLQ depth, Sheet sync failures, SLA jobs, and database health.
- `/api/health/live` is shallow/public; `/api/health/ready` is protected or network-restricted and checks database/queue dependencies without leaking configuration.
- Automated database backups and point-in-time recovery where available; documented RPO/RTO; quarterly restore exercises; export retention and key-rotation runbooks.

## Deployment topology and environments

Use isolated development, staging, and production Supabase projects, Sheets, credentials, and provider accounts. Run migrations through CI before application promotion. CI blocks on format/lint, `tsc --noEmit`, unit/integration/authorization tests, production build, dependency scanning, and migration checks. Production rollout uses feature flags, canary users, reconciliation gates, and documented rollback.

## Key decisions requiring owner approval

- Supabase region/data residency, retention, RPO/RTO, SSO/MFA policy, session lifetimes.
- Default role grants and exceptional user overrides.
- KPI definitions, currency/time-zone/tax semantics, pipeline transition owners, SLA calendar/holidays.
- External system ownership and integration SLAs.
- Communication providers, consent/opt-out rules, and WhatsApp template approval.
