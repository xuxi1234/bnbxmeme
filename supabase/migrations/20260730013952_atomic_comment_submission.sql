create index if not exists token_comments_signature_lower_idx
  on public.token_comments (lower(signature));

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
    or new.signature !~ '^0x[0-9a-f]{130}$'
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
    from public.token_comments
    where lower(signature) = new.signature
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

drop trigger if exists enforce_token_comment_submission
  on public.token_comments;
create trigger enforce_token_comment_submission
before insert on public.token_comments
for each row execute function public.enforce_token_comment_submission();

revoke all on function public.enforce_token_comment_submission()
  from public, anon, authenticated, service_role;

comment on function public.enforce_token_comment_submission() is
  'Atomically enforces wallet cooldown and case-insensitive signature replay protection for every insert path.';

create or replace function public.submit_token_comment(
  p_chain_id integer,
  p_token_address text,
  p_wallet_address text,
  p_body text,
  p_signature text,
  p_signed_at timestamptz
)
returns setof public.token_comments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_comment public.token_comments;
begin
  insert into public.token_comments (
    chain_id,
    token_address,
    wallet_address,
    body,
    signature,
    signed_at
  )
  values (
    p_chain_id,
    p_token_address,
    p_wallet_address,
    p_body,
    p_signature,
    p_signed_at
  )
  returning * into v_comment;

  return next v_comment;
end;
$$;

revoke all on function public.submit_token_comment(
  integer,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.submit_token_comment(
  integer,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

comment on function public.submit_token_comment(
  integer,
  text,
  text,
  text,
  text,
  timestamptz
) is
  'Backwards-compatible RPC entry point for atomically validated comment inserts.';
