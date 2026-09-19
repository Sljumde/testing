create table if not exists public.application_logs (
  log_id bigserial primary key,
  created_at timestamptz not null default now(),
  request_id uuid not null,
  route text not null,
  method text not null,
  action text not null check (action in ('CREATE', 'READ', 'UPDATE', 'DELETE', 'AUTH', 'SYSTEM')),
  resource text not null,
  operation text not null,
  query text,
  target_id text,
  status text not null check (status in ('started', 'success', 'failure')),
  status_code integer,
  duration_ms integer not null,
  user_email text,
  user_role text,
  supabase_auth_user_id uuid,
  deployment jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error jsonb
);

create index if not exists application_logs_created_at_idx
  on public.application_logs (created_at desc);

create index if not exists application_logs_request_id_idx
  on public.application_logs (request_id);

create index if not exists application_logs_route_status_idx
  on public.application_logs (route, status, created_at desc);

create index if not exists application_logs_user_email_idx
  on public.application_logs (user_email, created_at desc);

create index if not exists application_logs_resource_action_idx
  on public.application_logs (resource, action, created_at desc);

alter table public.application_logs enable row level security;

drop policy if exists "application_logs_service_role_all" on public.application_logs;
create policy "application_logs_service_role_all"
  on public.application_logs
  for all
  to service_role
  using (true)
  with check (true);
