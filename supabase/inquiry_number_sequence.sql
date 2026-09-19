create sequence if not exists public.inquiry_no_seq
  as bigint
  start with 20001
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

do $$
declare
  max_inquiry_no bigint;
begin
  select greatest(
    coalesce(max(inquiry_no::bigint), 20000),
    20000
  )
  into max_inquiry_no
  from public.inquiries
  where inquiry_no ~ '^[0-9]+$';

  perform setval('public.inquiry_no_seq', max_inquiry_no, true);
end $$;

create or replace function public.next_inquiry_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return nextval('public.inquiry_no_seq')::text;
end;
$$;

revoke all on function public.next_inquiry_no() from public;
grant execute on function public.next_inquiry_no() to authenticated;
grant execute on function public.next_inquiry_no() to service_role;

notify pgrst, 'reload schema';
