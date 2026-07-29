create table if not exists public.token_comments (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null default 56 check (chain_id = 56),
  token_address text not null check (
    token_address = lower(token_address)
    and token_address ~ '^0x[0-9a-f]{40}$'
  ),
  wallet_address text not null check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{40}$'
  ),
  body text not null check (
    char_length(body) between 1 and 280
    and body = btrim(body)
  ),
  signature text not null unique check (signature ~ '^0x[0-9a-fA-F]{130}$'),
  signed_at timestamptz not null,
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);

create index if not exists token_comments_token_created_idx
  on public.token_comments (chain_id, token_address, created_at desc)
  where hidden = false;

create index if not exists token_comments_wallet_created_idx
  on public.token_comments (wallet_address, created_at desc);

alter table public.token_comments enable row level security;

revoke all on table public.token_comments from anon, authenticated;
grant select, insert, update, delete on table public.token_comments to service_role;
