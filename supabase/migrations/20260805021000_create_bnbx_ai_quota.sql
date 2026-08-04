create table if not exists public.bnbx_ai_usage (
  bucket_date date not null,
  scope text not null check (scope in ('wallet','client','global')),
  scope_key text not null,
  request_count integer not null default 0,
  last_request_at timestamptz,
  primary key (bucket_date, scope, scope_key)
);
alter table public.bnbx_ai_usage enable row level security;
revoke all on public.bnbx_ai_usage from anon, authenticated;

create or replace function public.consume_bnbx_ai_quota(
  p_wallet text, p_client text, p_wallet_limit integer, p_client_limit integer,
  p_global_limit integer, p_min_interval_seconds integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare now_at timestamptz := clock_timestamp(); today date := current_date; w public.bnbx_ai_usage; c public.bnbx_ai_usage; g public.bnbx_ai_usage;
begin
  if p_wallet !~ '^0x[0-9a-f]{40}$' or length(p_client) < 16 then return jsonb_build_object('allowed',false,'reason','invalid'); end if;
  insert into public.bnbx_ai_usage values(today,'wallet',p_wallet,0,null) on conflict do nothing;
  insert into public.bnbx_ai_usage values(today,'client',p_client,0,null) on conflict do nothing;
  insert into public.bnbx_ai_usage values(today,'global','all',0,null) on conflict do nothing;
  select * into w from public.bnbx_ai_usage where bucket_date=today and scope='wallet' and scope_key=p_wallet for update;
  select * into c from public.bnbx_ai_usage where bucket_date=today and scope='client' and scope_key=p_client for update;
  select * into g from public.bnbx_ai_usage where bucket_date=today and scope='global' and scope_key='all' for update;
  if w.last_request_at is not null and now_at-w.last_request_at < make_interval(secs=>p_min_interval_seconds) then return jsonb_build_object('allowed',false,'reason','too_fast'); end if;
  if w.request_count>=p_wallet_limit or c.request_count>=p_client_limit or g.request_count>=p_global_limit then return jsonb_build_object('allowed',false,'reason','daily_limit'); end if;
  update public.bnbx_ai_usage set request_count=request_count+1,last_request_at=now_at where bucket_date=today and scope='wallet' and scope_key=p_wallet;
  update public.bnbx_ai_usage set request_count=request_count+1,last_request_at=now_at where bucket_date=today and scope='client' and scope_key=p_client;
  update public.bnbx_ai_usage set request_count=request_count+1,last_request_at=now_at where bucket_date=today and scope='global' and scope_key='all';
  return jsonb_build_object('allowed',true,'remaining',p_wallet_limit-w.request_count-1);
end $$;
revoke all on function public.consume_bnbx_ai_quota(text,text,integer,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_bnbx_ai_quota(text,text,integer,integer,integer,integer) to service_role;
