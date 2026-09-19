# BrownWall Revenue OS Data Model

## Conventions

- PostgreSQL/Supabase; UUID primary keys (`gen_random_uuid()`), UTC `timestamptz`, amounts as `numeric(18,2)` plus ISO currency.
- Mutable business tables include `created_at`, `created_by`, `updated_at`, `updated_by`, `row_version bigint default 1`, `deleted_at`, `deleted_by` unless explicitly immutable.
- Normalize email to lowercase trimmed form, Indian phone to E.164 (`+91…` where applicable), and names to Unicode-normalized/whitespace-collapsed forms. Preserve display values separately where useful.
- Foreign keys are explicit; uniqueness uses partial indexes excluding soft-deleted records where appropriate.

## Identity, access, and organization

- `users`: auth user ID, normalized email, display name, phone, status, authorization version, legacy email reference.
- `roles`: code, name, description, system flag.
- `permissions`: unique code, resource, action, description.
- `role_permissions`: role/permission grant.
- `user_roles`: user/role, optional team scope, effective dates, granted/by.
- `user_permissions`: explicit allow/deny override, optional scope, effective dates, reason.
- `teams`: name, manager user, parent team, status.
- `team_members`: team/user, membership role, effective dates.
- `sessions`: user, issued/last-seen/expires/revoked timestamps, revocation reason, hashed token/session identifier.
- `login_attempts`: normalized account hash, network hash, occurred timestamp, outcome; short retention.

## Customer and relationship

- `companies`: customer code (unique business ID), legal/display/normalized names, GST number, industry, addresses (or separate `company_addresses`), category, health, owner/team, acquisition source.
- `contacts`: company, display/normalized name, designation, normalized email/phone, decision-maker flag, consent/preferences, primary flag.
- `company_ownership_history`: company, from/to owner/team, reason, changed by/at.
- `company_merge_history`: surviving/merged company IDs, field resolution JSON, reason, actor/time. Merged records remain tombstoned and traceable.
- `attachments`: storage object metadata, entity type/ID, classification, uploaded by; binaries live in private object storage.

## Revenue pipeline

- `inquiries`: inquiry number (unique), company/contact, owner/team, type/source/category/occasion/location, requirement, quantity, budget/estimated value/currency, stage, probability snapshot, expected close date, next action/follow-up, SLA deadline/status, status, lost reason.
- `pipeline_stages`: code/name/order, probability, max SLA days, terminal/won/lost flags, active.
- `pipeline_stage_required_fields`: stage, field code, condition.
- `pipeline_stage_transitions`: from/to stage, required permission/role, active.
- `inquiry_stage_history` (append-only): inquiry, from/to stage, probability, entered/exited timestamps, duration, reason, actor, rule snapshot.
- `activities`: entity links, type, subject/summary, occurred_at, actor, outcome, source.
- `tasks`: type, owner/team, inquiry/company/contact links, due_at, priority, status, completion notes/time, source/rule.
- `communication_logs`: channel, sender user, recipient/contact, subject, safe summary, provider status/ID, failure code, direction, occurred_at, inquiry/company.
- `message_templates`: channel, name, subject/body template, variables, approval/version/status.

## Products and downstream lifecycle

- `products`: SKU/code, name, category, active, unit metadata.
- `inquiry_products`: inquiry/product, description, quantity, target price.
- `quotations`: quotation number, inquiry, version, status, totals/currency, valid until, external reference.
- `quotation_items`: quotation/product/description, quantity, unit price, taxes, total.
- `orders`: order number, company/inquiry/quotation, status, totals/currency, order/date fields, external system/reference/version/last synchronized.
- `order_items`: order/product/description, quantity, unit price, total.
- `integration_references`: local entity/type, external system/type/ID, synchronized status/version/time. Use for costing, sample, production, dispatch, payment, feedback, and future systems without copying their full operational state.

## Governance, configuration, and automation

- `audit_logs` (append-only): event ID/time, actor/session, action, module, entity type/ID, old/new values (redacted JSON), reason, request/correlation ID, outcome. Block update/delete for application roles.
- `dropdown_master`: domain/code/label/order, active/effective dates, metadata.
- `sla_rules`: entity/stage/team/category conditions, duration/calendar, severity, escalation policy/version.
- `notification_rules`: event/conditions/channel/recipients, quiet hours, digest/deduplication settings, active/version.
- `targets`: period, user/team, metric, value/currency.
- `saved_views`: owner/scope/module, filters/sort/columns JSON.
- `idempotency_keys`: actor, operation, key, request hash, response/status, expiry; unique actor+operation+key.
- `outbox_events`: aggregate/type/ID/version, event type/payload, available/processed timestamps, attempts, last error.
- `failed_jobs`: outbox/job reference, redacted payload, attempts/error, failed/resolved timestamps and actor.
- `sync_checkpoints`: integration/projection, cursor/version, last success/error, lag.

## Explainable intelligence

- `score_definitions`: code/name/version, factor rules/weights, thresholds, active dates.
- `entity_scores`: entity, definition/version, score, band, calculated_at, factor results JSON, confidence.
- `forecast_snapshots`: as-of time, scope/period/scenario, amount, confidence, factor/assumption JSON.

Scores are derived and reproducible; factor contributions must be returned to the UI. Historical snapshots are immutable.

## Core constraints and indexes

- Unique normalized active company GST number where present; unique active customer code and inquiry number.
- Contact uniqueness candidates on company + normalized email and company + normalized phone; candidates produce warnings rather than unsafe automatic merges.
- Checks: nonnegative quantity/amounts, probability 0–100, valid task/status transitions, lost reason for Lost, required closure data for Won.
- Index inquiry owner/team/stage/follow-up/SLA/created/expected-close fields; company normalized name/GST/owner; contact email/phone/company; task owner/status/due; activity and communication entity/timestamp; audit entity/time and actor/time; outbox unprocessed/available.
- Use `pg_trgm` indexes for company/contact similarity after threshold tuning.

## Transaction boundaries

- Inquiry create: allocate business ID, insert inquiry/stage history/default follow-up task/audit/outbox in one transaction.
- Stage transition: lock/version-check inquiry, enforce transition/required fields, close previous history, create history/task/audit/outbox atomically.
- Reassignment: check permission, update owner/history/open tasks/audit atomically.
- Merge: lock both companies, resolve children/references, tombstone duplicate, record merge/audit atomically.
- Delete/restore: soft-delete or restore entity and permitted children plus audit/outbox atomically.

## Legacy Sheet transition map

`Users` moves to Supabase Auth/users; `UserRoles` to role/team tables; `Inquiries` to inquiries/history/products; `Customer DB` to companies/contacts; `DropdownData` to dropdown master; `LoginLogs` to security/audit events; `Mailer`/`WhatsApp` to communication logs; `DELETED` to soft-deletion/audit. Exact column mapping must be generated from a live header inventory before migration—do not infer undocumented columns solely from array indexes.

## Migration controls

1. Snapshot and checksum source tabs; inventory tab IDs, headers, formulas, protected ranges, and row counts.
2. Stage raw immutable imports with source tab/row/checksum.
3. Normalize and validate into candidate tables; quarantine invalid/duplicate/orphan rows.
4. Business owners resolve exceptions and sign off mapping/KPI totals.
5. Load transactional tables with legacy references and reconciliation reports.
6. Run shadow reads, then database writes plus outbox Sheet projection.
7. Cut over by cohort/feature flag; retain read-only source snapshots and tested rollback.
