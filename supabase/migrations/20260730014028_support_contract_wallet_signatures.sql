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

comment on function public.enforce_token_comment_submission() is
  'Atomically validates EOA, ERC-1271, and ERC-6492 signed comments for every insert path.';
