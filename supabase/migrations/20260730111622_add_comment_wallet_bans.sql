create table if not exists public.comment_wallet_bans (
  wallet_address text primary key check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{40}$'
  ),
  reason text not null check (
    char_length(reason) between 1 and 280
    and reason = btrim(reason)
  ),
  active boolean not null default true,
  banned_at timestamptz not null default now(),
  banned_by text not null check (
    banned_by = lower(banned_by)
    and banned_by ~ '^0x[0-9a-f]{40}$'
  ),
  updated_at timestamptz not null default now(),
  updated_by text not null check (
    updated_by = lower(updated_by)
    and updated_by ~ '^0x[0-9a-f]{40}$'
  )
);

create index if not exists comment_wallet_bans_active_updated_idx
  on public.comment_wallet_bans (active, updated_at desc);

alter table public.comment_wallet_bans enable row level security;

revoke all on table public.comment_wallet_bans from anon, authenticated;
grant select, insert, update, delete
  on table public.comment_wallet_bans to service_role;

alter table public.comment_moderation_audit
  drop constraint if exists comment_moderation_audit_action_check,
  add constraint comment_moderation_audit_action_check check (
    action in (
      'set_enabled',
      'set_blocked_terms',
      'set_hidden',
      'delete',
      'ban_wallet',
      'unban_wallet'
    )
  );

create or replace function public.enforce_token_comment_submission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.token_address := lower(new.token_address);
  new.wallet_address := lower(new.wallet_address);
  new.signature := lower(new.signature);
  new.created_at := now();

  if new.chain_id is distinct from 56
    or new.token_address is null
    or new.token_address !~ '^0x[0-9a-f]{40}$'
    or new.wallet_address is null
    or new.wallet_address !~ '^0x[0-9a-f]{40}$'
    or new.body is null
    or char_length(new.body) not between 1 and 280
    or new.body is distinct from btrim(new.body)
    or new.signature is null
    or char_length(new.signature) not between 4 and 16386
    or new.signature !~ '^0x([0-9a-f]{2})+$'
    or new.signed_at is null
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_COMMENT_SUBMISSION';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('comment-signature:' || new.signature, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('comment-wallet:' || new.wallet_address, 0)
  );

  if exists (
    select 1
    from public.comment_wallet_bans
    where wallet_address = new.wallet_address
      and active = true
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COMMENT_WALLET_BANNED';
  end if;

  if exists (
    select 1
    from public.token_comments
    where md5(lower(signature)) = md5(new.signature)
      and lower(signature) = new.signature
  ) then
    raise exception using
      errcode = '23505',
      message = 'COMMENT_SIGNATURE_REPLAY';
  end if;

  if exists (
    select 1
    from public.token_comments
    where chain_id = new.chain_id
      and wallet_address = new.wallet_address
      and created_at >= new.created_at - interval '30 seconds'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COMMENT_RATE_LIMIT';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_token_comment_submission()
  from public, anon, authenticated, service_role;

comment on table public.comment_wallet_bans is
  'Server-only active and historical wallet bans for BNBX discussions.';

comment on function public.enforce_token_comment_submission() is
  'Atomically rejects banned wallets, replays, and cooldown violations for every comment insert path.';
