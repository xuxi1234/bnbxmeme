create table if not exists public.bnbx_ai_members (
  wallet text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  permanent_member boolean not null default true,
  credit_microusd bigint not null default 0 check (credit_microusd >= 0),
  lifetime_spent_microusd bigint not null default 0 check (lifetime_spent_microusd >= 0),
  payment_count integer not null default 0 check (payment_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bnbx_ai_payments (
  tx_hash text primary key check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  amount_wei numeric(78, 0) not null check (amount_wei >= 100000000000000000),
  credit_microusd bigint not null check (credit_microusd > 0),
  block_number bigint not null check (block_number > 0),
  confirmed_at timestamptz not null default now()
);

create table if not exists public.bnbx_ai_credit_reservations (
  reservation_id uuid primary key,
  wallet text not null references public.bnbx_ai_members(wallet),
  reserved_microusd bigint not null check (reserved_microusd > 0),
  actual_microusd bigint check (
    actual_microusd is null or
    (actual_microusd >= 0 and actual_microusd <= reserved_microusd)
  ),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  settled_at timestamptz
);

alter table public.bnbx_ai_members enable row level security;
alter table public.bnbx_ai_payments enable row level security;
alter table public.bnbx_ai_credit_reservations enable row level security;

revoke all on public.bnbx_ai_members from public, anon, authenticated;
revoke all on public.bnbx_ai_payments from public, anon, authenticated;
revoke all on public.bnbx_ai_credit_reservations from public, anon, authenticated;
grant select, insert, update on public.bnbx_ai_members to service_role;
grant select, insert on public.bnbx_ai_payments to service_role;
grant select, insert, update on public.bnbx_ai_credit_reservations to service_role;

create or replace function public.get_bnbx_ai_member(p_wallet text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare member_row public.bnbx_ai_members;
begin
  if p_wallet !~ '^0x[0-9a-f]{40}$' then
    return jsonb_build_object('member', false, 'credit_microusd', 0);
  end if;
  select * into member_row from public.bnbx_ai_members where wallet = p_wallet;
  if not found then
    return jsonb_build_object('member', false, 'credit_microusd', 0);
  end if;
  return jsonb_build_object(
    'member', member_row.permanent_member,
    'credit_microusd', member_row.credit_microusd,
    'lifetime_spent_microusd', member_row.lifetime_spent_microusd,
    'payment_count', member_row.payment_count
  );
end
$$;

create or replace function public.record_bnbx_ai_payment(
  p_tx_hash text,
  p_wallet text,
  p_amount_wei text,
  p_block_number bigint,
  p_credit_microusd bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare inserted_count integer;
declare member_row public.bnbx_ai_members;
begin
  if p_tx_hash !~ '^0x[0-9a-f]{64}$'
    or p_wallet !~ '^0x[0-9a-f]{40}$'
    or p_amount_wei !~ '^[0-9]+$'
    or p_amount_wei::numeric < 100000000000000000
    or p_block_number <= 0
    or p_credit_microusd <= 0 then
    raise exception 'invalid payment';
  end if;

  insert into public.bnbx_ai_payments(tx_hash, wallet, amount_wei, credit_microusd, block_number)
  values(p_tx_hash, p_wallet, p_amount_wei::numeric, p_credit_microusd, p_block_number)
  on conflict (tx_hash) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    insert into public.bnbx_ai_members(wallet, credit_microusd, payment_count)
    values(p_wallet, p_credit_microusd, 1)
    on conflict (wallet) do update set
      permanent_member = true,
      credit_microusd = public.bnbx_ai_members.credit_microusd + excluded.credit_microusd,
      payment_count = public.bnbx_ai_members.payment_count + 1,
      updated_at = now();
  elsif not exists (
    select 1 from public.bnbx_ai_payments
    where tx_hash = p_tx_hash and wallet = p_wallet
  ) then
    raise exception 'payment already claimed';
  end if;

  select * into member_row from public.bnbx_ai_members where wallet = p_wallet;
  return jsonb_build_object(
    'member', member_row.permanent_member,
    'credit_microusd', member_row.credit_microusd,
    'payment_count', member_row.payment_count,
    'credited', inserted_count = 1
  );
end
$$;

create or replace function public.reserve_bnbx_ai_credit(
  p_wallet text,
  p_reservation_id uuid,
  p_reserve_microusd bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare member_row public.bnbx_ai_members;
declare stale_row record;
begin
  if p_wallet !~ '^0x[0-9a-f]{40}$' or p_reserve_microusd <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid');
  end if;

  select * into member_row from public.bnbx_ai_members
  where wallet = p_wallet and permanent_member = true for update;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'membership_required');
  end if;

  for stale_row in
    select reservation_id, reserved_microusd
    from public.bnbx_ai_credit_reservations
    where wallet = p_wallet and status = 'reserved' and expires_at < now()
    for update
  loop
    update public.bnbx_ai_credit_reservations
    set status = 'released', settled_at = now()
    where reservation_id = stale_row.reservation_id;
    member_row.credit_microusd := member_row.credit_microusd + stale_row.reserved_microusd;
  end loop;

  if member_row.credit_microusd < p_reserve_microusd then
    update public.bnbx_ai_members
    set credit_microusd = member_row.credit_microusd, updated_at = now()
    where wallet = p_wallet;
    return jsonb_build_object(
      'allowed', false,
      'reason', 'credit_required',
      'credit_microusd', member_row.credit_microusd
    );
  end if;

  insert into public.bnbx_ai_credit_reservations(
    reservation_id, wallet, reserved_microusd
  ) values(p_reservation_id, p_wallet, p_reserve_microusd);
  update public.bnbx_ai_members
  set credit_microusd = member_row.credit_microusd - p_reserve_microusd,
      updated_at = now()
  where wallet = p_wallet;
  return jsonb_build_object(
    'allowed', true,
    'credit_microusd', member_row.credit_microusd - p_reserve_microusd
  );
end
$$;

create or replace function public.settle_bnbx_ai_credit(
  p_reservation_id uuid,
  p_actual_microusd bigint,
  p_release boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare reservation_row public.bnbx_ai_credit_reservations;
declare refund bigint;
declare remaining bigint;
begin
  select * into reservation_row from public.bnbx_ai_credit_reservations
  where reservation_id = p_reservation_id for update;
  if not found or reservation_row.status <> 'reserved' then
    raise exception 'invalid reservation';
  end if;
  if p_actual_microusd < 0 or p_actual_microusd > reservation_row.reserved_microusd then
    raise exception 'invalid actual cost';
  end if;

  refund := case when p_release then reservation_row.reserved_microusd
    else reservation_row.reserved_microusd - p_actual_microusd end;
  update public.bnbx_ai_members set
    credit_microusd = credit_microusd + refund,
    lifetime_spent_microusd = lifetime_spent_microusd +
      case when p_release then 0 else p_actual_microusd end,
    updated_at = now()
  where wallet = reservation_row.wallet
  returning credit_microusd into remaining;
  update public.bnbx_ai_credit_reservations set
    actual_microusd = case when p_release then 0 else p_actual_microusd end,
    status = case when p_release then 'released' else 'settled' end,
    settled_at = now()
  where reservation_id = p_reservation_id;
  return jsonb_build_object('credit_microusd', remaining);
end
$$;

revoke all on function public.get_bnbx_ai_member(text) from public, anon, authenticated;
revoke all on function public.record_bnbx_ai_payment(text,text,text,bigint,bigint) from public, anon, authenticated;
revoke all on function public.reserve_bnbx_ai_credit(text,uuid,bigint) from public, anon, authenticated;
revoke all on function public.settle_bnbx_ai_credit(uuid,bigint,boolean) from public, anon, authenticated;
grant execute on function public.get_bnbx_ai_member(text) to service_role;
grant execute on function public.record_bnbx_ai_payment(text,text,text,bigint,bigint) to service_role;
grant execute on function public.reserve_bnbx_ai_credit(text,uuid,bigint) to service_role;
grant execute on function public.settle_bnbx_ai_credit(uuid,bigint,boolean) to service_role;
