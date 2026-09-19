# CRM Supabase Integration README

## Project State

This CRM was originally built around Google Sheets / Apps Script / Korosuno flows. We are migrating the system to Supabase while keeping the existing CRM UI mostly intact.

The current migration focus is:

- Client/company/contact lookup and creation in Supabase
- Inquiry creation directly into Supabase
- Inquiry list/read from Supabase
- Inquiry update into Supabase
- Inquiry soft delete in Supabase
- User-authenticated Supabase writes so database audit triggers can use `auth.uid()`
- Application-level logging in Supabase for API/query/user/deployment/error traceability

## Supabase Tables / Views In Use

Important Supabase objects:

- `public.companies`
- `public.contacts`
- `public.categories`
- `public.company_categories`
- `public.client_lookup`
- `public.inquiries`
- `public.crm_inquiry_view`
- `public.employees`
- `public.audit_log`
- `public.application_logs`

## Authentication Model

The CRM still has its legacy CRM login/session, but we added Supabase Auth session handling.

On login:

1. CRM validates the user through the existing CRM user flow.
2. If CRM login succeeds, the app also signs into Supabase Auth using the same email/password.
3. Supabase access and refresh tokens are stored in HttpOnly cookies.
4. API routes can create an authenticated Supabase server client using the logged-in user's JWT.

This is required because the Postgres audit trigger depends on:

```sql
auth.uid()
```

The database maps:

```sql
auth.users.id
→ employees.auth_user_id
→ employees.emp_id
→ employees.email_id
```

Important requirement:

Every active CRM user must exist in Supabase Auth, and `employees.auth_user_id` must point to the correct `auth.users.id`.

## Inquiry Creation Flow

Current inquiry creation flow:

```text
Inquiry form
→ ensure company/contact/category in Supabase
→ /api/inquiries/create
→ authenticated Supabase user client
→ insert into public.inquiries
→ audit trigger sees auth.uid()
```

The create route no longer depends on Apps Script/Korosuno for normal inquiry creation.

Main files:

- `components/inquiry-form.tsx`
- `app/api/clients/ensure/route.ts`
- `app/api/inquiries/create/route.ts`
- `lib/supabase-inquiry-sync.ts`
- `lib/supabase/server.ts`

## Client / Company / Contact Flow

The inquiry form uses Supabase lookup through `public.client_lookup`.

Expected behavior:

1. User types or selects company name.
2. App searches `client_lookup`.
3. If company exists, it fetches related contacts.
4. Contact dropdown displays `contact_person_name`.
5. Internally, the form stores `contact_id`.
6. Selecting a contact autofills:
   - Phone
   - Email
   - Category
   - Location
7. If the company/contact does not exist, the user can enter the data in the same fields.
8. On submit, `/api/clients/ensure` creates/reuses:
   - company
   - contact
   - company/category relationship

Important rule:

Do not identify contacts by name. Always use `contact_id`.

## Inquiry Read Flow

View Inquiries now reads from Supabase, not Google Sheets.

Main files:

- `app/view-inquiries/page.tsx`
- `app/api/inquiries/route.ts`
- `lib/supabase-inquiries.ts`

The app reads from:

```sql
public.crm_inquiry_view
```

The app also cross-checks `public.inquiries.is_active` so soft-deleted rows are hidden from the CRM, even if the database view still returns them.

## Inquiry Update Flow

View Inquiries update now writes to Supabase.

Main file:

- `app/api/inquiries/update/route.ts`

The update route:

- Requires CRM session
- Requires Supabase Auth session
- Verifies the CRM user email matches Supabase user email
- Uses the authenticated Supabase user client
- Updates `public.inquiries`
- Lets RLS enforce allowed edit scope
- Does not retry with service role if RLS blocks the update

This allows the audit trigger to capture:

```text
auth_user_id
employee_id
employee_email
old_data
new_data
```

## Inquiry Delete Flow

Delete is now a Supabase soft delete.

Main file:

- `app/api/inquiries/delete/route.ts`

Current delete behavior:

```sql
public.inquiries.is_active = false
```

The row is not physically removed.

Reason:

- Preserve history
- Preserve audit trail
- Allow recovery if needed
- Let database audit trigger capture the delete action as an update

Important:

Deleted rows may still appear in `public.inquiries` and `public.crm_inquiry_view`. That is expected. The CRM app hides deleted rows using `is_active`.

Recommended future database improvement:

Update `public.crm_inquiry_view` so it filters inactive rows directly:

```sql
where inquiries.is_active is distinct from false
```

or stricter:

```sql
where inquiries.is_active = true
```

## Audit Logging

There are two logging layers:

## 1. Database Audit Trigger

This is handled inside Supabase/Postgres.

It uses:

```sql
auth.uid()
```

This should capture row-level changes for create/update/delete-like operations.

Expected audit data:

- `action`
- `auth_user_id`
- `employee_id`
- `employee_email`
- `old_data`
- `new_data`
- `changed_at`

The frontend does not insert into `audit_log`.

## 2. Application Logs

We added app-level logging to Supabase:

```sql
public.application_logs
```

SQL file:

- `supabase/application_logs.sql`

Logger file:

- `lib/app-logger.ts`

This answers operational questions like:

- Which API failed?
- Which user triggered it?
- What query failed?
- What deployment introduced it?
- What was the error?
- How long did it take?
- What request id connects all events?

Fields logged include:

- `request_id`
- `route`
- `method`
- `action`
- `resource`
- `operation`
- `query`
- `target_id`
- `status`
- `status_code`
- `duration_ms`
- `user_email`
- `user_role`
- `supabase_auth_user_id`
- `deployment`
- `metadata`
- `error`

Covered routes:

- `/api/clients/ensure`
- `/api/inquiries/create`
- `/api/inquiries`
- `/api/inquiries/update`
- `/api/inquiries/delete`

## Application Logs Table Setup

Before app logging works, run:

```sql
-- File:
-- supabase/application_logs.sql
```

This creates:

```sql
public.application_logs
```

with indexes and service-role-only RLS policy.

## Current Important Files

Supabase helpers:

- `lib/supabase/server.ts`
- `lib/supabase/browser.ts`

Inquiry sync/create:

- `lib/supabase-inquiry-sync.ts`

Inquiry read mapping:

- `lib/supabase-inquiries.ts`

App logger:

- `lib/app-logger.ts`

Inquiry APIs:

- `app/api/inquiries/create/route.ts`
- `app/api/inquiries/route.ts`
- `app/api/inquiries/update/route.ts`
- `app/api/inquiries/delete/route.ts`

Client ensure API:

- `app/api/clients/ensure/route.ts`

Inquiry form:

- `components/inquiry-form.tsx`

View inquiries UI:

- `components/view-inquiries-client.tsx`

## Known Current Caveats

1. `public.crm_inquiry_view` may still return deleted rows unless the view SQL is updated.
   The app filters them out using `public.inquiries.is_active`.

2. Delete is a soft delete, not a physical delete.
   Rows remain in Supabase for history and audit.

3. Some old/background code still exists for Korosuno/App Script.
   Normal inquiry creation no longer depends on it, but legacy routes may still remain.

4. TypeScript check still has unrelated existing errors in:
   - `components/customers-client.tsx`
   - `components/login-client.tsx`
   - `components/view-inquiries-client.tsx`
   - `security-activity/page.tsx`

5. `npm run build` passes.

6. `npx tsc --noEmit` fails due to the unrelated legacy typing issues above.

## Recommended Next Steps

1. Update `public.crm_inquiry_view` to filter inactive inquiries at the database level.

2. Ensure every CRM user exists in Supabase Auth.

3. Ensure every employee has:

```sql
employees.auth_user_id = auth.users.id
```

4. Test audit for:

- CREATE inquiry
- UPDATE sales stage
- UPDATE remarks
- UPDATE follow-up date
- DELETE inquiry

5. Query latest audit logs:

```sql
select
  audit_id,
  action,
  auth_user_id,
  employee_id,
  employee_email,
  database_role,
  changed_at
from public.audit_log
order by changed_at desc
limit 20;
```

6. Query latest application logs:

```sql
select
  created_at,
  route,
  method,
  action,
  operation,
  status,
  status_code,
  user_email,
  target_id,
  error,
  deployment
from public.application_logs
order by created_at desc
limit 50;
```

## Summary

The CRM is now partially migrated from Google Sheets/Korosuno to Supabase.

Normal user-driven inquiry create/update/delete operations are designed to use the authenticated Supabase user session so Postgres can correctly resolve `auth.uid()` and populate audit logs.

The app also writes operational logs to `public.application_logs`, giving visibility into failed APIs, users, queries, deployments, and errors.
