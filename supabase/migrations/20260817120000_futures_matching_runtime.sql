create table if not exists public.futures_matching_states (
  deployment_key text primary key
    check (deployment_key ~ '^97:0x[0-9a-f]{40}$'),
  revision bigint not null check (revision >= 0),
  serialized jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.futures_effect_leases (
  deployment_key text primary key
    references public.futures_matching_states(deployment_key) on delete cascade,
  lease_owner uuid not null,
  lease_expires_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.futures_fill_index (
  chain_id smallint not null check (chain_id = 97),
  order_book text not null check (order_book ~ '^0x[0-9a-f]{40}$'),
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null check (log_index >= 0),
  block_number bigint not null check (block_number >= 0),
  block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
  maker_order_id text not null check (maker_order_id ~ '^0x[0-9a-f]{64}$'),
  taker_order_id text not null check (taker_order_id ~ '^0x[0-9a-f]{64}$'),
  maker_wallet text not null check (maker_wallet ~ '^0x[0-9a-f]{40}$'),
  taker_wallet text not null check (taker_wallet ~ '^0x[0-9a-f]{40}$'),
  quantity numeric(78, 0) not null check (quantity > 0),
  price numeric(78, 0) not null check (price > 0),
  confirmed_at timestamptz not null default clock_timestamp(),
  primary key (chain_id, order_book, tx_hash, log_index)
);

create index if not exists futures_fill_maker_wallet_idx
  on public.futures_fill_index (maker_wallet, block_number desc);
create index if not exists futures_fill_taker_wallet_idx
  on public.futures_fill_index (taker_wallet, block_number desc);

alter table public.futures_matching_states enable row level security;
alter table public.futures_effect_leases enable row level security;
alter table public.futures_fill_index enable row level security;

create policy futures_matching_states_deny_direct_access
  on public.futures_matching_states
  as restrictive for all to public
  using (false) with check (false);
create policy futures_effect_leases_deny_direct_access
  on public.futures_effect_leases
  as restrictive for all to public
  using (false) with check (false);
create policy futures_fill_index_deny_direct_access
  on public.futures_fill_index
  as restrictive for all to public
  using (false) with check (false);

revoke all on public.futures_matching_states from public, anon, authenticated;
revoke all on public.futures_effect_leases from public, anon, authenticated;
revoke all on public.futures_fill_index from public, anon, authenticated;

create or replace function public.futures_matching_state_load(
  p_deployment_key text
) returns table(revision bigint, serialized jsonb)
language sql
security invoker
set search_path = ''
as $$
  select s.revision, s.serialized
  from public.futures_matching_states as s
  where s.deployment_key = p_deployment_key
    and p_deployment_key ~ '^97:0x[0-9a-f]{40}$';
$$;

create or replace function public.futures_matching_state_cas(
  p_deployment_key text,
  p_expected_revision bigint,
  p_next_revision bigint,
  p_serialized jsonb
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_deployment_key !~ '^97:0x[0-9a-f]{40}$'
     or p_expected_revision < -1
     or p_next_revision <> p_expected_revision + 1
     or p_next_revision < 0
     or p_serialized is null
     or jsonb_typeof(p_serialized) <> 'object'
     or octet_length(p_serialized::text) > 2097152 then
    return false;
  end if;

  if p_expected_revision = -1 then
    insert into public.futures_matching_states(
      deployment_key, revision, serialized
    ) values (
      p_deployment_key, p_next_revision, p_serialized
    ) on conflict (deployment_key) do nothing;
    return found;
  end if;

  update public.futures_matching_states
  set revision = p_next_revision,
      serialized = p_serialized,
      updated_at = clock_timestamp()
  where deployment_key = p_deployment_key
    and revision = p_expected_revision;
  return found;
end;
$$;

create or replace function public.futures_effect_lease_acquire(
  p_deployment_key text,
  p_lease_owner uuid,
  p_lease_seconds integer
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_deployment_key !~ '^97:0x[0-9a-f]{40}$'
     or p_lease_owner is null
     or p_lease_seconds < 1 or p_lease_seconds > 60 then
    return false;
  end if;

  insert into public.futures_effect_leases(
    deployment_key, lease_owner, lease_expires_at
  ) values (
    p_deployment_key,
    p_lease_owner,
    clock_timestamp() + make_interval(secs => p_lease_seconds)
  )
  on conflict (deployment_key) do update
    set lease_owner = excluded.lease_owner,
        lease_expires_at = excluded.lease_expires_at,
        updated_at = clock_timestamp()
    where public.futures_effect_leases.lease_expires_at <= clock_timestamp()
       or public.futures_effect_leases.lease_owner = excluded.lease_owner;
  return found;
end;
$$;

create or replace function public.futures_effect_lease_release(
  p_deployment_key text,
  p_lease_owner uuid
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.futures_effect_leases
  where deployment_key = p_deployment_key
    and lease_owner = p_lease_owner;
  return found;
end;
$$;

create or replace function public.futures_fill_upsert(
  p_chain_id integer,
  p_order_book text,
  p_tx_hash text,
  p_log_index integer,
  p_block_number bigint,
  p_block_hash text,
  p_maker_order_id text,
  p_taker_order_id text,
  p_maker_wallet text,
  p_taker_wallet text,
  p_quantity numeric,
  p_price numeric
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_chain_id <> 97
     or p_order_book !~ '^0x[0-9a-f]{40}$'
     or p_tx_hash !~ '^0x[0-9a-f]{64}$'
     or p_log_index < 0
     or p_block_number < 0
     or p_block_hash !~ '^0x[0-9a-f]{64}$'
     or p_maker_order_id !~ '^0x[0-9a-f]{64}$'
     or p_taker_order_id !~ '^0x[0-9a-f]{64}$'
     or p_maker_wallet !~ '^0x[0-9a-f]{40}$'
     or p_taker_wallet !~ '^0x[0-9a-f]{40}$'
     or p_quantity <= 0 or p_price <= 0 then
    return false;
  end if;

  insert into public.futures_fill_index(
    chain_id, order_book, tx_hash, log_index, block_number, block_hash,
    maker_order_id, taker_order_id, maker_wallet, taker_wallet, quantity, price
  ) values (
    p_chain_id, p_order_book, p_tx_hash, p_log_index, p_block_number,
    p_block_hash, p_maker_order_id, p_taker_order_id, p_maker_wallet,
    p_taker_wallet, p_quantity, p_price
  )
  on conflict (chain_id, order_book, tx_hash, log_index) do update
    set block_number = excluded.block_number,
        block_hash = excluded.block_hash,
        maker_order_id = excluded.maker_order_id,
        taker_order_id = excluded.taker_order_id,
        maker_wallet = excluded.maker_wallet,
        taker_wallet = excluded.taker_wallet,
        quantity = excluded.quantity,
        price = excluded.price,
        confirmed_at = clock_timestamp();
  return true;
end;
$$;

create or replace function public.futures_fill_list(
  p_wallet text,
  p_limit integer
) returns setof public.futures_fill_index
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_wallet !~ '^0x[0-9a-f]{40}$'
     or p_limit < 1 or p_limit > 100 then
    return;
  end if;
  return query
    select f.* from public.futures_fill_index as f
    where f.maker_wallet = p_wallet or f.taker_wallet = p_wallet
    order by f.block_number desc, f.log_index desc
    limit p_limit;
end;
$$;

revoke all on function public.futures_matching_state_load(text)
  from public, anon, authenticated;
revoke all on function public.futures_matching_state_cas(text, bigint, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.futures_effect_lease_acquire(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.futures_effect_lease_release(text, uuid)
  from public, anon, authenticated;
revoke all on function public.futures_fill_upsert(integer, text, text, integer, bigint, text, text, text, text, text, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.futures_fill_list(text, integer)
  from public, anon, authenticated;

grant select, insert, update on public.futures_matching_states to service_role;
grant select, insert, update, delete on public.futures_effect_leases to service_role;
grant select, insert, update on public.futures_fill_index to service_role;
grant execute on function public.futures_matching_state_load(text) to service_role;
grant execute on function public.futures_matching_state_cas(text, bigint, bigint, jsonb) to service_role;
grant execute on function public.futures_effect_lease_acquire(text, uuid, integer) to service_role;
grant execute on function public.futures_effect_lease_release(text, uuid) to service_role;
grant execute on function public.futures_fill_upsert(integer, text, text, integer, bigint, text, text, text, text, text, numeric, numeric) to service_role;
grant execute on function public.futures_fill_list(text, integer) to service_role;
