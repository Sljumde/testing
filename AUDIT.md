# BrownWall CRM Technical Audit

Date: 2026-07-16  
Scope: complete repository excluding generated dependencies/build output. This is a source-code audit; the live Google spreadsheet, Vercel configuration, production traffic, and external BrownWall systems were not available for inspection.

## Executive conclusion

The application is a useful Google-Sheets-backed CRM prototype, but it is not yet safe as a production revenue system. Its principal risks are plaintext credentials, incomplete API authentication, request-controlled ownership and sender identity, weak object-level authorization, non-atomic identifiers and multi-step deletes, positional row schemas, unrestricted full-sheet reads, and no automated tests. Phase 1 must establish a secure application boundary and migration seams before adding pipeline or dashboard features.

## Existing architecture

- Next.js 16 App Router and React 19, deployed as a standalone Next.js application (Vercel Analytics is enabled in production).
- Server components load sessions and Sheet data; large client components implement forms, editing, filtering, sorting, and pagination.
- Google Sheets is both the transactional store and reporting store. `lib/sheets.ts` owns authentication plus inquiry, customer, dropdown, and login-log access.
- Google service-account credentials and a spreadsheet ID are server environment variables.
- Authentication uses a signed HS256 JWT in an HttpOnly, `SameSite=Lax`, 24-hour cookie. Password comparison reads plaintext values from the `Users` sheet.
- Coarse roles (`BOSS`, `HEAD`, `EMPLOYEE`) are read from `UserRoles`; team access is derived from `reportsTo` email strings.
- No repository/service/domain separation, background-job layer, migrations, database, centralized validation, error model, permission engine, or audit subsystem exists.

## Routes and modules

| Route | Purpose | Current control |
|---|---|---|
| `/`, `/login` | redirect/login | login is public as expected |
| `/dashboard` | counts/navigation | proxy protected; page does not redirect itself |
| `/inquiry` | new inquiry | authenticated page |
| `/view-inquiries` | list/edit/delete/communication actions | authenticated, role-derived data scope |
| `/customers` | list/bulk edit | authenticated page |
| `/customers/new` | create customer | authenticated page |
| `/api/auth/login`, `/logout` | session lifecycle | no throttling, lockout, revocation, or CSRF |
| `/api/inquiries` | authorized inquiry list | authenticated, full Sheet scan |
| `/api/inquiries/create` | create inquiry | authenticated; owner accepted from JSON |
| `/api/inquiries/update` | bulk row replacement | authenticated; authorization trusts submitted owner field |
| `/api/inquiries/delete` | archive then delete | BOSS label only; hardcoded `sheetId: 0`; partial success reported as success |
| `/api/customers` | authorized customer list | authenticated, full Sheet scan |
| `/api/customers/add`, `/create` | duplicate create APIs | authenticated; owner accepted from JSON |
| `/api/customers/update` | bulk row replacement | authentication only; no ownership/permission check |
| `/api/dropdown-data` | dropdowns and contacts | unauthenticated; reads business/contact data |
| `/api/email-log`, `/whatsapp-log` | log claimed communication | unauthenticated; sender/timestamp accepted from JSON |
| `/api/health` | process configuration check | public; shallow only |

## Security weaknesses

1. Passwords are readable in `Users` and compared directly in `validateLogin`.
2. Login returns the email as a fake `token`; dashboard code also stores it in `localStorage`.
3. JWTs have no session ID, rotation, idle timeout, server-side revocation, or account-disable check.
4. No login throttling, lockout, password-reset implementation, or failed-login abuse protection exists.
5. No CSRF token/origin enforcement exists for cookie-authenticated writes; `SameSite=Lax` is useful but not a complete write policy.
6. No security headers/CSP are configured. TypeScript build errors are explicitly ignored.
7. `/api/email-log`, `/api/whatsapp-log`, and `/api/dropdown-data` lack authentication. The first two permit forged sender identities and arbitrary Sheet writes.
8. Request bodies are unvalidated and error handling/logging is inconsistent. Logs can include identifiers and raw provider errors.
9. `USER_ENTERED` writes allow spreadsheet formula injection from user-controlled values.
10. Logout only deletes a browser cookie and cannot revoke a copied JWT.

## Authorization weaknesses

- Authorization is scattered through routes and UI and is based on role labels rather than permissions.
- Customer update checks only authentication, so any logged-in user can replace any located customer row.
- Customer and inquiry creation trust `salesPersonEmail` supplied by the browser.
- Inquiry update authorizes against `data[9]` from the submitted replacement row, not the persisted owner. This enables ownership/authorization confusion and does not separately protect reassignment.
- Bulk updates are not pre-authorized as one set and can partially apply before a later item fails.
- Communication sender identity and timestamps are browser-controlled.
- Role/team mappings are mutable spreadsheet strings, have no effective dates or permission audit, and default unknown users to `EMPLOYEE`.
- UI edit restrictions are duplicated and must never be treated as an enforcement boundary.

## Data integrity and concurrency risks

- Inquiry numbers use an in-process promise queue plus read/increment/write. Multiple Vercel instances can allocate the same number.
- Customer codes use a scan/max/append pattern with the same race.
- Rows have no UUID, version, created/updated actor fields, soft-delete metadata, or database constraints.
- Inquiry/customer APIs replace whole positional arrays, causing lost updates and accidental column corruption.
- Archive and delete are separate operations. Delete failure is swallowed and returned as success, leaving duplicate active/archived records.
- Restore does not exist. `sheetId: 0` assumes the Inquiries tab position.
- Formula columns and template/header offsets are implicit. Column indexes are duplicated across server and clients.
- No idempotency keys protect creates from retries/double submission.
- No normalization, uniqueness constraints, referential integrity, or controlled company/contact model exists.

## Performance and reliability bottlenecks

- `A:ZZ`/whole-column Sheet reads occur for lists and dropdowns; filtering and pagination happen in memory/browser.
- Dashboard issues list requests merely to calculate counts.
- Role lookups repeatedly scan `UserRoles`; dropdowns are uncached.
- Bulk changes execute sequential per-row API calls to Sheets.
- A 2,491-line inquiry component contains duplicated filtering/pagination paths and high render/maintenance cost.
- There is no retry/backoff, timeout policy, circuit breaker, failed-job queue, sync monitor, structured logging, error tracking, backup runbook, or meaningful dependency health check.

## Duplicate or obsolete code

- `/api/customers/add` and `/api/customers/create` call the same create implementation.
- `addCustomer` aliases `addNewCustomer`; `verifySession` aliases `getServerSession` without semantic distinction.
- Inquiry client contains duplicated filtering/sorting/pagination logic.
- Login behavior appears both on `/login` and in the dashboard client; fake `auth_token` local storage is obsolete beside the HttpOnly session.
- Placeholder/v0 metadata, debug `[v0]` logs, duplicate global style locations, and unused UI primitives should be reviewed after dependency analysis.
- `any` is present across Sheet access, sessions, customers, and update payloads.

## Business-process gaps

There are no governed stage transitions/history, probability/SLA rules, tasks, activity model, true communication delivery, Customer 360, multi-contact company model, duplicate merge, quotation/order linkage, targets/forecasts, explainable scores, immutable audit page, data-quality controls, saved views, or system-of-record integration contracts.

## Proposed target architecture

Use Supabase Auth and PostgreSQL as identity/transactional systems, with Row Level Security as defense in depth. Keep Next.js route handlers as the application boundary and introduce centralized session, permission, validation, audit, error, repository, and service layers. Write business transactions to PostgreSQL; enqueue idempotent outbox jobs to synchronize sanitized reporting projections to Google Sheets. See `TARGET_ARCHITECTURE.md` and `DATA_MODEL.md`.

## Phased implementation plan

1. **Stabilize:** secure identity, revocable sessions, request validation, CSRF/origin protection, permission enforcement, ownership fixes, safe Sheet adapter, atomic IDs, audit logging, test/build gates.
2. **Operational CRM:** normalized company/contact/inquiry pipeline, transition policy, tasks, SLA automation, Customer 360, duplicate detection/merge, communication timeline.
3. **Management intelligence:** governed KPI definitions, role dashboards, targets, funnel and explainable forecasts/scores.
4. **Business integration:** foreign references and synchronized status for costing, samples, orders, production, dispatch, payments, feedback.
5. **Advanced intelligence:** calibrated explainable prioritization and forecasting, monitored for drift and override outcomes.

## Immediate severity order

- **Critical:** plaintext authentication; unauthenticated log writes; customer object authorization; client-controlled ownership/sender.
- **High:** non-atomic identifiers; unsafe full-row updates; formula injection; delete inconsistency; ignored build errors; no validation/audit/revocation.
- **Medium:** full-sheet scans, duplicated logic/APIs, `any`, shallow health checks, missing operational controls.

## Audit limitations and required discovery

Before production migration, inventory actual Sheet tab IDs, headers/formulas/protected ranges/row counts, Vercel environment and logs, current users and ownership exceptions, external-system APIs and identifiers, data retention requirements, India privacy/contract obligations, recovery objectives, and current backup/export procedures. No production readiness claim should be made until penetration testing, migration reconciliation, restore testing, and authorization tests pass.
