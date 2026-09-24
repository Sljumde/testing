-- Production RPCs for inquiry creation and dashboard KPIs.
-- Run this in Supabase SQL editor before deploying the app changes that call these RPCs.

alter table public.inquiries
  add column if not exists request_id uuid;

create unique index if not exists inquiries_request_id_uidx
  on public.inquiries (request_id)
  where request_id is not null;

create index if not exists inquiries_active_salesperson_idx
  on public.inquiries (sales_person_email_raw)
  where is_active is distinct from false;

create index if not exists inquiries_active_followup_idx
  on public.inquiries (next_followup_date, followup_date)
  where is_active is distinct from false;

create or replace function public.crm_create_inquiry(
  p_request_id uuid,
  p_actor_email text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_email text := lower(nullif(btrim(p_actor_email), ''));
  v_existing public.inquiries%rowtype;
  v_inquiry_no text;
  v_now timestamptz := now();

  v_company_id public.companies.company_id%type;
  v_contact_id public.contacts.contact_id%type;
  v_category_id public.categories.category_id%type;
  v_inquiry_company_id public.inquiries.company_id%type;
  v_inquiry_contact_id public.inquiries.contact_id%type;
  v_inquiry_category_id public.inquiries.category_id%type;

  v_company text := nullif(btrim(p_payload->>'company'), '');
  v_contact_name text := nullif(btrim(p_payload->>'contactName'), '');
  v_phone text := nullif(regexp_replace(coalesce(p_payload->>'phone', ''), '\D', '', 'g'), '');
  v_email text := nullif(btrim(p_payload->>'email'), '');
  v_category text := nullif(btrim(p_payload->>'category'), '');
  v_location text := nullif(btrim(p_payload->>'location'), '');
  v_city text;
  v_state text;

  v_sales_person_emp_id public.employees.emp_id%type;
  v_sales_person_name text;
  v_second_owner_emp_id public.employees.emp_id%type;
  v_back_office_emp_id public.employees.emp_id%type;
  v_first_owner_emp_id public.employees.emp_id%type;
  v_lead_generator_emp_id public.employees.emp_id%type;

  v_next_followup_date text := nullif(btrim(p_payload->>'nextFollowupDate'), '');
  v_budget numeric;
  v_quantity numeric;
  v_owner text;
begin
  if p_request_id is null then
    raise exception 'request_id is required';
  end if;

  select *
    into v_existing
    from public.inquiries
   where request_id = p_request_id
   limit 1;

  if found then
    return jsonb_build_object(
      'inquiryNo', v_existing.inquiry_no,
      'company', coalesce(v_existing.company_name_raw, v_company),
      'contactName', coalesce(v_existing.contact_name_raw, v_contact_name),
      'company_id', v_existing.company_id,
      'contact_id', v_existing.contact_id,
      'category_id', v_existing.category_id,
      'idempotent', true
    );
  end if;

  if nullif(p_payload->>'company_id', '') is not null then
    v_company_id := nullif(p_payload->>'company_id', '');
    select company_id, company_name
      into v_company_id, v_company
      from public.companies
     where company_id = v_company_id
     limit 1;
  end if;

  if v_company_id is null and v_company is not null then
    select company_id, company_name
      into v_company_id, v_company
      from public.companies
     where lower(btrim(company_name)) = lower(v_company)
     limit 1;
  end if;

  if v_company_id is null and v_company is not null then
    insert into public.companies (company_name)
    values (v_company)
    returning company_id, company_name into v_company_id, v_company;
  end if;

  if v_location is not null then
    if position(',' in v_location) > 0 then
      v_city := nullif(btrim(split_part(v_location, ',', 1)), '');
      v_state := nullif(btrim(substr(v_location, position(',' in v_location) + 1)), '');
    else
      v_city := v_location;
      v_state := null;
    end if;
  end if;

  if nullif(p_payload->>'contact_id', '') is not null then
    v_contact_id := nullif(p_payload->>'contact_id', '');
    select contact_id, contact_person_name, phone_no, email
      into v_contact_id, v_contact_name, v_phone, v_email
      from public.contacts
     where contact_id = v_contact_id
     limit 1;
  end if;

  if v_contact_id is null and v_company_id is not null then
    select contact_id
      into v_contact_id
      from public.contacts
     where company_id = v_company_id
       and (
         (v_phone is not null and regexp_replace(coalesce(phone_no, ''), '\D', '', 'g') = v_phone)
         or (v_email is not null and lower(coalesce(email, '')) = lower(v_email))
         or (v_contact_name is not null and lower(btrim(coalesce(contact_person_name, ''))) = lower(v_contact_name))
       )
     order by is_primary desc nulls last, contact_id
     limit 1;
  end if;

  if v_contact_id is null and v_company_id is not null and v_contact_name is not null then
    insert into public.contacts (
      company_id,
      contact_person_name,
      phone_no,
      email,
      city,
      state,
      is_primary,
      is_active
    )
    values (
      v_company_id,
      v_contact_name,
      v_phone,
      v_email,
      v_city,
      v_state,
      true,
      true
    )
    returning contact_id into v_contact_id;
  end if;

  if nullif(p_payload->>'category_id', '') is not null then
    v_category_id := nullif(p_payload->>'category_id', '');
  elsif v_category is not null then
    select category_id
      into v_category_id
      from public.categories
     where lower(btrim(category_name)) = lower(v_category)
       and is_active is distinct from false
     limit 1;
  end if;

  if v_company_id is not null and v_category_id is not null then
    insert into public.company_categories (company_id, category_id)
    values (v_company_id, v_category_id)
    on conflict (company_id, category_id) do nothing;
  end if;

  select emp_id, coalesce(nullif(btrim(emp_full_name), ''), nullif(btrim(emp_name), ''))
    into v_sales_person_emp_id, v_sales_person_name
    from public.employees
   where lower(email_id) = v_actor_email
     and is_active is distinct from false
   limit 1;

  v_owner := nullif(btrim(p_payload->>'secondOwner'), '');
  if v_owner is not null then
    select emp_id into v_second_owner_emp_id from public.employees
     where is_active is distinct from false
       and (lower(email_id) = lower(v_owner) or upper(emp_name) = upper(v_owner) or upper(emp_full_name) = upper(v_owner))
     limit 1;
  end if;

  v_owner := nullif(btrim(p_payload->>'backOffice'), '');
  if v_owner is not null then
    select emp_id into v_back_office_emp_id from public.employees
     where is_active is distinct from false
       and (lower(email_id) = lower(v_owner) or upper(emp_name) = upper(v_owner) or upper(emp_full_name) = upper(v_owner))
     limit 1;
  end if;

  v_owner := nullif(btrim(p_payload->>'firstOwner'), '');
  if v_owner is not null then
    select emp_id into v_first_owner_emp_id from public.employees
     where is_active is distinct from false
       and (lower(email_id) = lower(v_owner) or upper(emp_name) = upper(v_owner) or upper(emp_full_name) = upper(v_owner))
     limit 1;
  end if;

  v_owner := nullif(btrim(p_payload->>'leadGenerator'), '');
  if v_owner is not null then
    select emp_id into v_lead_generator_emp_id from public.employees
     where is_active is distinct from false
       and (lower(email_id) = lower(v_owner) or upper(emp_name) = upper(v_owner) or upper(emp_full_name) = upper(v_owner))
     limit 1;
  end if;

  if nullif(p_payload->>'budget', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_budget := (p_payload->>'budget')::numeric;
  end if;

  if nullif(p_payload->>'quantity', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_quantity := (p_payload->>'quantity')::numeric;
  end if;

  v_inquiry_company_id := v_company_id::text;
  v_inquiry_contact_id := v_contact_id::text;
  v_inquiry_category_id := v_category_id::text;

  for _attempt in 1..300 loop
    v_inquiry_no := public.next_inquiry_no();

    begin
      insert into public.inquiries (
        request_id,
        inquiry_no,
        inquiry_timestamp,
        company_id,
        company_name_raw,
        contact_id,
        contact_name_raw,
        phone_raw,
        email_raw,
        category_id,
        category_raw,
        details,
        lead_source,
        sales_person_emp_id,
        sales_person_email_raw,
        sales_person_name_raw,
        sales_stage,
        update_remarks,
        next_steps,
        next_followup_date,
        budget,
        budget_raw,
        quantity,
        quantity_raw,
        followup_date,
        followup_date_raw,
        occasion,
        location,
        inquiry_type,
        second_owner_emp_id,
        second_owner_raw,
        back_office_emp_id,
        back_office_raw,
        first_owner_emp_id,
        first_owner_raw,
        lead_generator_emp_id,
        lead_generator_raw,
        created_by_emp_id,
        is_active
      )
      values (
        p_request_id,
        v_inquiry_no,
        v_now,
        v_inquiry_company_id,
        v_company,
        v_inquiry_contact_id,
        v_contact_name,
        v_phone,
        v_email,
        v_inquiry_category_id,
        v_category,
        nullif(btrim(p_payload->>'details'), ''),
        nullif(btrim(p_payload->>'leadSource'), ''),
        v_sales_person_emp_id,
        v_actor_email,
        v_sales_person_name,
        nullif(btrim(p_payload->>'salesStage'), ''),
        nullif(btrim(p_payload->>'updateRemarks'), ''),
        nullif(btrim(p_payload->>'nextSteps'), ''),
        v_next_followup_date,
        v_budget,
        nullif(p_payload->>'budget', ''),
        v_quantity,
        nullif(p_payload->>'quantity', ''),
        v_next_followup_date,
        v_next_followup_date,
        nullif(btrim(p_payload->>'occasion'), ''),
        v_location,
        nullif(btrim(p_payload->>'inquiryType'), ''),
        v_second_owner_emp_id,
        nullif(btrim(p_payload->>'secondOwner'), ''),
        v_back_office_emp_id,
        nullif(btrim(p_payload->>'backOffice'), ''),
        v_first_owner_emp_id,
        nullif(btrim(p_payload->>'firstOwner'), ''),
        v_lead_generator_emp_id,
        nullif(btrim(p_payload->>'leadGenerator'), ''),
        v_sales_person_emp_id,
        true
      )
      returning * into v_existing;

      return jsonb_build_object(
        'inquiryNo', v_existing.inquiry_no,
        'company', coalesce(v_existing.company_name_raw, v_company),
        'contactName', coalesce(v_existing.contact_name_raw, v_contact_name),
        'company_id', v_existing.company_id,
        'contact_id', v_existing.contact_id,
        'category_id', v_existing.category_id,
        'idempotent', false
      );
    exception
      when unique_violation then
        select *
          into v_existing
          from public.inquiries
         where request_id = p_request_id
         limit 1;

        if found then
          return jsonb_build_object(
            'inquiryNo', v_existing.inquiry_no,
            'company', coalesce(v_existing.company_name_raw, v_company),
            'contactName', coalesce(v_existing.contact_name_raw, v_contact_name),
            'company_id', v_existing.company_id,
            'contact_id', v_existing.contact_id,
            'category_id', v_existing.category_id,
            'idempotent', true
          );
        end if;
    end;
  end loop;

  raise exception 'Unable to allocate a unique inquiry number after 300 attempts';
end;
$$;

revoke all on function public.crm_create_inquiry(uuid, text, jsonb) from public;
revoke all on function public.crm_create_inquiry(uuid, text, jsonb) from anon;
revoke all on function public.crm_create_inquiry(uuid, text, jsonb) from authenticated;
grant execute on function public.crm_create_inquiry(uuid, text, jsonb) to service_role;

create or replace function public.dashboard_summary(p_user_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(nullif(btrim(p_user_email), ''));
  v_emp record;
  v_role text := 'EMPLOYEE';
  v_authorized_emails text[] := array[]::text[];
  v_team_members jsonb := '[]'::jsonb;
  v_team jsonb;
  v_mine jsonb;
  v_upcoming jsonb;
  v_unclassified integer := 0;
begin
  select e.emp_id, e.team_id, e.email_id, e.role_id, r.role_name
    into v_emp
    from public.employees e
    left join public.roles r on r.role_id = e.role_id
   where lower(e.email_id) = v_email
     and e.is_active is distinct from false
   limit 1;

  if found then
    v_role := coalesce(upper(nullif(btrim(v_emp.role_name), '')), 'EMPLOYEE');
  end if;

  if v_role = 'BOSS' then
    select coalesce(array_agg(lower(email_id) order by email_id), array[]::text[])
      into v_authorized_emails
      from public.employees
     where is_active is distinct from false
       and nullif(btrim(email_id), '') is not null;

    select coalesce(jsonb_agg(item), '[]'::jsonb)
      into v_team_members
      from (
        select jsonb_build_object(
          'email', lower(email_id),
          'name', coalesce(nullif(btrim(emp_full_name), ''), nullif(btrim(emp_name), ''), split_part(lower(email_id), '@', 1))
        ) as item
          from public.employees
         where is_active is distinct from false
           and lower(email_id) <> v_email
           and nullif(btrim(email_id), '') is not null
         order by coalesce(emp_full_name, emp_name, email_id)
         limit 30
      ) team;
  elsif v_role = 'HEAD' and v_emp.team_id is not null then
    select coalesce(array_agg(lower(email_id) order by email_id), array[]::text[])
      into v_authorized_emails
      from public.employees
     where is_active is distinct from false
       and team_id = v_emp.team_id
       and nullif(btrim(email_id), '') is not null;

    select coalesce(jsonb_agg(item), '[]'::jsonb)
      into v_team_members
      from (
        select jsonb_build_object(
          'email', lower(email_id),
          'name', coalesce(nullif(btrim(emp_full_name), ''), nullif(btrim(emp_name), ''), split_part(lower(email_id), '@', 1))
        ) as item
          from public.employees
         where is_active is distinct from false
           and team_id = v_emp.team_id
           and lower(email_id) <> v_email
           and nullif(btrim(email_id), '') is not null
         order by coalesce(emp_full_name, emp_name, email_id)
         limit 30
      ) team;
  else
    v_authorized_emails := array[v_email];
  end if;

  with scoped as (
    select
      *,
      regexp_replace(lower(btrim(coalesce(sales_stage, ''))), '\s+', ' ', 'g') as stage_key,
      coalesce(nullif(company_id::text, ''), regexp_replace(lower(btrim(coalesce(company_name_raw, ''))), '\s+', ' ', 'g')) as company_key,
      case
        when nullif(regexp_replace(coalesce(revenue::text, ''), '[^0-9.-]', '', 'g'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then nullif(regexp_replace(coalesce(revenue::text, ''), '[^0-9.-]', '', 'g'), '')::numeric
        else 0
      end as revenue_value
      from public.inquiries
     where is_active is distinct from false
       and lower(coalesce(sales_person_email_raw, '')) = any(v_authorized_emails)
  )
  select jsonb_build_object(
    'revenue', coalesce(sum(revenue_value), 0),
    'customers', count(distinct nullif(company_key, '')),
    'inquiries', count(*),
    'stages', jsonb_build_object(
      'active', count(*) filter (where stage_key in ('discovery', 'lead qualified', 'sample shared', 'shared quotation')),
      'hot', count(*) filter (where stage_key in ('final follow up', 'under negotiation')),
      'won', count(*) filter (where stage_key = 'order won'),
      'lost', count(*) filter (where stage_key in ('order lost', 'dead')),
      'unclassified', count(*) filter (where stage_key not in ('discovery', 'lead qualified', 'sample shared', 'shared quotation', 'final follow up', 'under negotiation', 'order won', 'order lost', 'dead'))
    )
  ),
  count(*) filter (where stage_key not in ('discovery', 'lead qualified', 'sample shared', 'shared quotation', 'final follow up', 'under negotiation', 'order won', 'order lost', 'dead'))::integer
  into v_team, v_unclassified
  from scoped;

  with scoped as (
    select
      *,
      regexp_replace(lower(btrim(coalesce(sales_stage, ''))), '\s+', ' ', 'g') as stage_key,
      coalesce(nullif(company_id::text, ''), regexp_replace(lower(btrim(coalesce(company_name_raw, ''))), '\s+', ' ', 'g')) as company_key,
      case
        when nullif(regexp_replace(coalesce(revenue::text, ''), '[^0-9.-]', '', 'g'), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then nullif(regexp_replace(coalesce(revenue::text, ''), '[^0-9.-]', '', 'g'), '')::numeric
        else 0
      end as revenue_value
      from public.inquiries
     where is_active is distinct from false
       and lower(coalesce(sales_person_email_raw, '')) = v_email
  )
  select jsonb_build_object(
    'revenue', coalesce(sum(revenue_value), 0),
    'customers', count(distinct nullif(company_key, '')),
    'inquiries', count(*),
    'stages', jsonb_build_object(
      'active', count(*) filter (where stage_key in ('discovery', 'lead qualified', 'sample shared', 'shared quotation')),
      'hot', count(*) filter (where stage_key in ('final follow up', 'under negotiation')),
      'won', count(*) filter (where stage_key = 'order won'),
      'lost', count(*) filter (where stage_key in ('order lost', 'dead')),
      'unclassified', count(*) filter (where stage_key not in ('discovery', 'lead qualified', 'sample shared', 'shared quotation', 'final follow up', 'under negotiation', 'order won', 'order lost', 'dead'))
    )
  )
  into v_mine
  from scoped;

  with scoped as (
    select
      inquiry_no,
      company_name_raw,
      contact_name_raw,
      phone_raw,
      sales_stage,
      sales_person_name_raw,
      sales_person_email_raw,
      case
        when coalesce(nullif(next_followup_date::text, ''), nullif(followup_date::text, '')) ~ '^\d{4}-\d{2}-\d{2}' then left(coalesce(nullif(next_followup_date::text, ''), nullif(followup_date::text, '')), 10)::date
        when coalesce(nullif(next_followup_date::text, ''), nullif(followup_date::text, '')) ~ '^\d{1,2}/\d{1,2}/\d{4}' then to_date(split_part(coalesce(nullif(next_followup_date::text, ''), nullif(followup_date::text, '')), ' ', 1), 'DD/MM/YYYY')
        else null
      end as followup_day
      from public.inquiries
     where is_active is distinct from false
       and lower(coalesce(sales_person_email_raw, '')) = any(v_authorized_emails)
  )
  select coalesce(jsonb_agg(item order by followup_day, inquiry_no), '[]'::jsonb)
    into v_upcoming
    from (
      select
        followup_day,
        inquiry_no,
        jsonb_build_object(
          'date', followup_day::text,
          'label', case when followup_day = (timezone('Asia/Kolkata', now())::date + 1) then 'Tomorrow' else 'Day After Tomorrow' end,
          'inquiryNo', inquiry_no::text,
          'company', coalesce(company_name_raw, ''),
          'contact', coalesce(contact_name_raw, ''),
          'phone', coalesce(phone_raw, ''),
          'stage', coalesce(sales_stage, ''),
          'salesperson', coalesce(nullif(btrim(sales_person_name_raw), ''), sales_person_email_raw, '')
        ) as item
        from scoped
       where followup_day in (timezone('Asia/Kolkata', now())::date + 1, timezone('Asia/Kolkata', now())::date + 2)
       order by followup_day, inquiry_no
       limit 8
    ) upcoming_items;

  return jsonb_build_object(
    'role', v_role,
    'team', case when v_role = 'EMPLOYEE' then null else v_team end,
    'mine', v_mine,
    'upcoming', v_upcoming,
    'teamMembers', v_team_members,
    'diagnostics', jsonb_build_object('unclassifiedTeam', v_unclassified)
  );
end;
$$;

revoke all on function public.dashboard_summary(text) from public;
revoke all on function public.dashboard_summary(text) from anon;
revoke all on function public.dashboard_summary(text) from authenticated;
grant execute on function public.dashboard_summary(text) to service_role;
