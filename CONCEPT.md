# BrownWall CRM Concept

## Executive homepage and Timeless

### Shared authenticated navigation

Authenticated pages use one `AppShell` and `GlobalHeader` from the root layout. Active-route rules are: `/dashboard` Home, `/view-inquiries` Inquiries, `/customers/**` Client DB, `/timeless/**` Timeless, and `/inquiry` New Inquiry. Desktop navigation uses compact pills; mobile retains the New Inquiry action and moves other links plus Logout into a minimum-44px menu. Future authenticated pages are added to the AppShell route list and navigation map rather than implementing page-local headers.

### Timeless weekly calendar

Date-only Timeless events receive deterministic display-only slots; source sheet values are never changed. Within each date, generated placement sorts by normalized Company Name and then Inquiry Number, assigns 30-minute slots from 10:00 through 17:30, and reuses the same sixteen slots round-robin when necessary. Genuine source times remain genuine. The detail dialog labels generated values as calendar display slots and separately shows the original source date. The calendar never renders an all-day dump or extends beyond 18:00; crowded slots show two lanes plus a complete overflow popover.

Timeless requests one explicit Monday–Sunday range through `startDate` and `endDate`. The API rejects invalid or greater-than-seven-day ranges, applies inquiry authorization before returning events, sorts chronologically, caps output, and deduplicates by inquiry number + event type + timestamp. Inquiry Created maps to `TS Backup`; Follow-up Due maps to `Next Followup Date`. Date-only follow-ups stay on their local calendar date and appear under All-day / Time not set. Invalid dates are excluded and counted in diagnostics. Desktop uses a bounded week grid from 08:00–20:00; mobile defaults to Day view. Week changes replace data, abort stale requests, and never use infinite scrolling.

The homepage is a compact sales command centre with Home, Inquiries, Client DB, New Inquiry, and Timeless navigation. Team Performance appears only for BOSS and HEAD roles; My Performance always uses the authenticated session email. Aggregation occurs server-side after existing role and row-visibility filtering.

Revenue is the sum of valid numeric values from `SR CUSTOMER DATA` column H (`Revenue`). Currency symbols and separators are removed; invalid values contribute zero. Customers are counted as unique normalized, non-empty Company Name values, so duplicate contact rows do not inflate the KPI. Inquiry totals count authorized `Inquiries` rows.

Sales Stage values are whitespace/case normalized. Active comprises Discovery, Lead Qualified, Sample Shared, and Shared Quotation; Hot Leads comprises Final Follow Up and Under Negotiation; Won is Order Won; Lost comprises Order Lost and Dead. Blank and unknown stages remain Unclassified in backend diagnostics.

Coming Up uses `Next Followup Date` and includes tomorrow and day-after-tomorrow records, sorted earliest first and limited to eight. Timeless creates Inquiry Created events from `TS Backup` and Follow-up Due events from `Next Followup Date`. Individual inquiry scope matches `Sales Person Email` to the secure session email. Customer scope matches session/authorized emails against comma-separated `ownership email`, retaining the established BOSS visibility rule.

## Client Database architecture

The Client Database uses an authenticated server endpoint as its data boundary. The browser requests one page at a time and receives a typed projection rather than raw 52-column Google Sheet rows. User identity and authorized salesperson scope are derived from the signed server session and `UserRoles`, never from browser-supplied role or ownership values.

Google Sheets remains the current backend. Server-side search, filtering, sorting, row authorization, projection, and pagination occur before a response is sent. PostgreSQL remains the recommended long-term operational store because Sheets cannot perform indexed database queries.

## Protected fields

Protection applies only to displayed Contact Name, Phone Number, and Email in the read-only Client Database. Values are complete and unmasked.

- CSS disables standard selection and WebKit touch callout.
- Copy, cut, context-menu, and drag-start events are prevented on the displayed value elements.
- Values are not duplicated into hidden elements, browser storage, or frontend logs.
- Phone values use `tel:` links, allowing supported Android browsers to open the native dialer.
- Email values use `mailto:` links.
- Protection does not cancel ordinary link clicks.
- Authorized editing forms are outside this policy.

## Pagination logic

- Page size is fixed at exactly 15 records.
- The API validates `page`, `search`, `state`, `clientCategory`, `sort`, and `direction`.
- Search is debounced by 350 ms; search and filter changes reset to page 1.
- Authorization is applied before search, sort, total calculation, and pagination.
- The browser receives only the current page projection and pagination metadata.
- Previous, Next, and page-number controls request new server pages.
- Page changes display skeleton rows/cards and abort obsolete requests.
- The UI reports the current range, such as “Showing 16–30 of 284 clients”.

## Data exposure rules

- EMPLOYEE receives clients assigned to their session email.
- HEAD receives their own and mapped team members’ clients.
- BOSS receives clients within the organization mapping.
- The projection contains client code, company, contact name/designation, phone, email, city/state, category/ownership, and assigned salesperson only.
- Raw Sheet rows, addresses, notes, unused columns, and the complete database are not returned to this browser module.
- Opening a client row/card calls a protected audit endpoint. Scope is checked again before user email, role, client code, company, server timestamp, forwarded IP, and user agent are appended to `AuditLogs`.
- The legacy create route/form is retained for compatibility but is no longer linked from the dashboard or Client Database.

## Watermark behaviour

The viewport contains a fixed, repeating, diagonal, low-opacity watermark with `BROWNWALL CONFIDENTIAL`, derived user name, user email, and a timestamp refreshed every minute. It uses `pointer-events: none`, works on desktop/mobile, appears in ordinary screenshots, and does not obstruct controls.

Newly issued sessions include a random session ID in the signed JWT. It is included in the watermark and audit events. Sessions created before this change display a legacy-session marker until the user signs in again.

## Send-to-device and email workflow

Indian mobile numbers are normalized without duplicating country prefixes: valid 10-digit mobile numbers become `+91…`, existing `91…` becomes `+91…`, and existing `+91…` remains unchanged. The Send to device button first writes a server-verified audit event and then opens the normalized `tel:` URI. On Android this normally opens the native dialer. Desktop Chrome or the operating system may offer a connected-device handler when the same Google account and appropriate Chrome sync/device-sharing settings are present; the application cannot force that behaviour. If no handler is available, the user must confirm browser/device association settings.

Email actions similarly write an audit event and open `mailto:` without copying the address or recording message content.

## Audit logging and suspicious-access rules

Client opens, searches, filters, page requests, Send to device, email actions, rejected customer actions, and supported deterrent events use server-session identity. Events include server timestamp, role/email, client/company where relevant, session ID, forwarded IP, user agent, result, metadata, risk level, and investigation status. Complete customer records and communication contents are not logged.

The initial risk classification is LOW for ordinary navigation/contact actions, MEDIUM for copy/context-menu attempts, and HIGH for unauthorized access. The BOSS-only `/security-activity` view supports human review and does not accuse a user automatically. Rate/volume thresholds for rapid paging, excessive searches, repeated actions, unusual hours, and permission failures must move to a shared production rate-limit/event store; per-instance memory is not reliable on Vercel. Until that store is selected, raw events are retained for review rather than claiming robust cross-instance anomaly detection.

## Role permissions

Customer permissions are centralized. EMPLOYEE receives own-client read scope; HEAD receives own and mapped-team read scope; BOSS receives organization read, customer audit-read, and export permission. Export remains unimplemented so no browser route can download customer data. UI visibility is supplementary—the API performs session and record-scope checks.

## Future client-data schema

The final customer schema is intentionally pending. Current fields are mapped through `CUSTOMER_COLUMNS`; new fields, KPIs, edit forms, saved views, and the permission-controlled Add Client drawer must not be enabled until field definitions, ownership rules, validation, and data classification are approved.

## KPI definitions

- **Visible clients:** total authorized records matching current server filters.
- **Access scope:** label derived from the authenticated role mapping.
- **Page size:** fixed response limit of 15.

No active-client, follow-up, activity, contact-count, or data-quality KPI is displayed until its data source and business definition are approved.

## Known limitations

Browser selection, copy, cut, context-menu, and drag restrictions deter casual copying only. They cannot defeat screenshots, photography, accessibility tooling, or developer tools. Real protection depends on least-privilege server authorization, minimal responses, auditing, and policy. Google Sheets still requires the server to scan authorized source rows for search/sort; only the resulting 15-item page is delivered to the browser.

## Change log

### 2026-08-04 Edit Inquiry performance and reliability

- Edit Inquiry continues to use `POST /api/inquiries/update` and operates only on the legacy `Inquiries` tab; Create Inquiry, Korosuno, Client DB, Keystone, Dashboard, and Delete Inquiry are outside this flow.
- The update route authenticates the session, reads `UserRoles`, reads `Inquiries`, locates exactly one row whose column A Inquiry No matches the requested inquiry number, rejects missing rows with 404, rejects duplicate Inquiry Numbers with 409, and confirms the target row still contains the expected Inquiry No before writing.
- The frontend sends the full 36-cell edited row for compatibility plus the original column B timestamp. The backend treats the timestamp as a lightweight stale-edit guard and returns `409 STALE_EDIT` if another edit changed the row after the user opened it.
- Editable columns are C Company, D Contact Name, E Phone, F Email, G Category, H Details, I Lead Source, J Sales Person Email, K Sales Stage, L Update Remarks, M Next Steps, N Next Followup Date, O Budget, P Quantity, AD Inquiry Type, AE 2nd Owner, AF Back Office, AG 1st Owner, and AH Lead Generator. Column B Timestamp is server-updated on real changes.
- Protected/system columns remain protected in edit: A Inquiry No, Q Total/formula area, R Sample Cost, S Revenue, T Conversion, U:W locked/system columns, X TS Backup, Y:AC unused/legacy fields including Occasion display source where not edited by the current UI, AI Lead Qualifier, and AJ Status.
- The backend updates only changed approved editable cells plus column B Timestamp using one `values.batchUpdate` call per edited inquiry instead of rewriting broad `A:T` and `X:AJ` ranges. No BACKUP, Korosuno, dashboard, Client DB, Keystone, InquirySequence, or delete/archive tabs are touched by Edit Inquiry.
- Crucial remains the Edit Inquiry audit log and is only appended to for changed audited fields. Existing Crucial data is not overwritten, cleared, renamed, recreated, reordered, or removed. Each audit row is `[timestamp, session.email, inquiryNo, fieldLabel, oldValue, newValue]` across columns A:F.
- Audited fields remain Company, Contact Name, Phone, Email, Sales Stage, Occasion, 2nd Owner, Back Office, 1st Owner, and Lead Generator. Unchanged fields do not create Crucial rows, and Create Inquiry/Korosuno never write Crucial rows.
- The frontend disables Save immediately, shows `Saving changes...`, sends one update request, closes edit mode and shows `Inquiry updated` as soon as the backend confirms success, applies the edited row locally, and runs the full refresh separately in the background.
- If the save response times out or is not valid JSON, the frontend does not automatically resend. It enters `Confirming changes...`, refetches `Inquiries`, compares the specific Inquiry No against the frozen edited payload, treats matching values as success, and otherwise asks the user to refresh before retrying.
- Local checks: `npm run build` passes. `npm run lint` cannot launch because `eslint` is not available in this checkout. `npx.cmd tsc --noEmit` still reports pre-existing unrelated TypeScript errors in customer/login/view-inquiries/security files.

### 2026-08-04

- Create Inquiry now uses QStash for orchestration and Supabase as the only write target.
- Normal inquiry creation authenticates in Next.js, derives `Sales Person Email` from the server session, stores request status in Upstash Redis, publishes one stable QStash job, and lets `/api/jobs/create-inquiry` insert into Supabase.
- Create Inquiry no longer writes to Google Sheets, Apps Script, `BACKUP`, `DELETED`, `Crucial`, dashboard sheets, Total, Q formulas, or legacy 36-column inquiry segments.
- Inquiry numbers are allocated by the Supabase `next_inquiry_no` RPC inside the worker create path; duplicate numbers are unacceptable, skipped numbers are acceptable.
- Browser submission generates one UUID only on first valid submit, freezes the payload, disables the form, shows a visible success modal with the Inquiry No, and redirects to `/dashboard` after roughly 1.8 seconds.
- Timeout or uncertain network failure keeps the form blocked and polls `/api/inquiries/create-status?requestId=...` using the same requestId; it never creates a fresh request automatically.
- The create route returns `202` with `pending: true` after the QStash publish and the frontend keeps the original frozen request blocked while polling status.
- If status confirmation exceeds 90 seconds, the user remains on a blocking confirmation screen with `Check Again`; this button polls the same requestId and never resubmits the inquiry form.
- Required server environment variables are `APP_BASE_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`.
- Apps Script is no longer part of inquiry creation and the source has been removed.

### 2026-07-16

- Added typed customer projection and centralized legacy column mapping.
- Added authenticated server-side search/filter/sort pagination fixed at 15 clients.
- Added complete protected contact values with functional `tel:` and `mailto:` links.
- Added client-open audit logging and a repeating confidentiality watermark.
- Removed New Customer navigation while retaining reusable legacy code and route.
