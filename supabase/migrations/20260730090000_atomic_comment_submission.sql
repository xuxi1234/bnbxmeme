create index if not exists token_comments_signature_lower_idx
  on public.token_comments (lower(signature));

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
  v_token_address text := lower(p_token_address);
  v_wallet_address text := lower(p_wallet_address);
  v_signature text := lower(p_signature);
  v_comment public.token_comments;
begin
  if p_chain_id is distinct from 56
    or v_token_address is null
    or v_token_address !~ '^0x[0-9a-f]{40}$'
    or v_wallet_address is null
    or v_wallet_address !~ '^0x[0-9a-f]{40}$'
    or p_body is null
    or char_length(p_body) not between 1 and 280
    or p_body is distinct from btrim(p_body)
    or v_signature is null
    or v_signature !~ '^0x[0-9a-f]{130}$'
    or p_signed_at is null
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_COMMENT_SUBMISSION';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('comment-signature:' || v_signature, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('comment-wallet:' || v_wallet_address, 0)
  );

  if exists (
    select 1
    from public.token_comments
    where lower(signature) = v_signature
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COMMENT_SIGNATURE_REPLAY';
  end if;

  if exists (
    select 1
    from public.token_comments
    where chain_id = p_chain_id
      and wallet_address = v_wallet_address
      and created_at >= now() - interval '30 seconds'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COMMENT_RATE_LIMIT';
  end if;

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
    v_token_address,
    v_wallet_address,
    p_body,
    v_signature,
    p_signed_at
  )
  returning * into v_comment;

  return next v_comment;
end;
$$;

revoke insert on table public.token_comments from service_role;
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
  'Atomically enforces wallet cooldown and case-insensitive signature replay protection.';
