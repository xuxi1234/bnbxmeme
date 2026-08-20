create table if not exists public.futures_api_quotas (
  quota_key text primary key check (quota_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

create index if not exists futures_api_quotas_window_idx
  on public.futures_api_quotas (window_started_at);

create table if not exists public.futures_api_nonces (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists futures_api_nonces_expiry_idx
  on public.futures_api_nonces (expires_at);

alter table public.futures_api_quotas enable row level security;
alter table public.futures_api_nonces enable row level security;
revoke all on public.futures_api_quotas from public, anon, authenticated;
revoke all on public.futures_api_nonces from public, anon, authenticated;

create or replace function public.consume_futures_api_quota(
  p_quota_key text,
  p_maximum integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.futures_api_quotas%rowtype;
  cutoff timestamptz := clock_timestamp() - make_interval(secs => p_window_seconds);
begin
  if p_quota_key !~ '^[0-9a-f]{64}$' or p_maximum < 1 or p_maximum > 1000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid futures quota policy';
  end if;

  delete from public.futures_api_quotas where ctid in (
    select ctid from public.futures_api_quotas
      where window_started_at < clock_timestamp() - interval '1 day' limit 100
  );

  insert into public.futures_api_quotas(quota_key, window_started_at, request_count)
  values (p_quota_key, clock_timestamp(), 1)
  on conflict (quota_key) do nothing;
  if found then return true; end if;

  select * into current_row from public.futures_api_quotas
    where quota_key = p_quota_key for update;
  if current_row.window_started_at <= cutoff then
    update public.futures_api_quotas
      set window_started_at = clock_timestamp(), request_count = 1
      where quota_key = p_quota_key;
    return true;
  end if;
  if current_row.request_count >= p_maximum then return false; end if;
  update public.futures_api_quotas set request_count = request_count + 1
    where quota_key = p_quota_key;
  return true;
end;
$$;

create or replace function public.register_futures_api_nonce(
  p_nonce_hash text,
  p_fingerprint_hash text,
  p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_nonce_hash !~ '^[0-9a-f]{64}$' or p_fingerprint_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '10 minutes' then
    return false;
  end if;
  delete from public.futures_api_nonces where ctid in (
    select ctid from public.futures_api_nonces
      where expires_at < clock_timestamp() - interval '1 hour' limit 100
  );
  insert into public.futures_api_nonces(nonce_hash, fingerprint_hash, expires_at)
    values (p_nonce_hash, p_fingerprint_hash, p_expires_at)
    on conflict (nonce_hash) do nothing;
  return found;
end;
$$;

create or replace function public.consume_futures_api_nonce(
  p_nonce_hash text,
  p_fingerprint_hash text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.futures_api_nonces%rowtype;
begin
  select * into current_row from public.futures_api_nonces
    where nonce_hash = p_nonce_hash for update;
  if not found or current_row.fingerprint_hash <> p_fingerprint_hash
     or current_row.expires_at <= clock_timestamp() or current_row.consumed_at is not null then
    return false;
  end if;
  update public.futures_api_nonces set consumed_at = clock_timestamp()
    where nonce_hash = p_nonce_hash and consumed_at is null;
  return found;
end;
$$;

revoke all on function public.consume_futures_api_quota(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.register_futures_api_nonce(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.consume_futures_api_nonce(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_futures_api_quota(text, integer, integer) to service_role;
grant execute on function public.register_futures_api_nonce(text, text, timestamptz) to service_role;
grant execute on function public.consume_futures_api_nonce(text, text) to service_role;
