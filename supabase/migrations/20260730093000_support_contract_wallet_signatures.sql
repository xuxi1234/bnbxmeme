alter table public.token_comments
  drop constraint if exists token_comments_signature_key,
  drop constraint if exists token_comments_signature_check,
  add constraint token_comments_signature_check check (
    char_length(signature) between 4 and 16386
    and signature ~ '^0x([0-9a-fA-F]{2})+$'
  );

drop index if exists public.token_comments_signature_lower_idx;

create index if not exists token_comments_signature_hash_idx
  on public.token_comments (md5(lower(signature)));

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
    or char_length(v_signature) not between 4 and 16386
    or v_signature !~ '^0x([0-9a-f]{2})+$'
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
    where md5(lower(signature)) = md5(v_signature)
      and lower(signature) = v_signature
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
  'Atomically submits EOA, ERC-1271, or ERC-6492 signed comments with replay protection.';
