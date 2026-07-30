create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.token_comments (id)
    on delete cascade,
  reporter_wallet text not null check (
    reporter_wallet = lower(reporter_wallet)
    and reporter_wallet ~ '^0x[0-9a-f]{40}$'
  ),
  reason text not null check (
    reason in ('spam', 'scam', 'harassment', 'illegal', 'other')
  ),
  signature text not null check (
    char_length(signature) between 4 and 16386
    and signature ~ '^0x([0-9a-fA-F]{2})+$'
  ),
  signed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint comment_reports_wallet_once unique (
    comment_id,
    reporter_wallet
  )
);

create index if not exists comment_reports_comment_created_idx
  on public.comment_reports (comment_id, created_at desc);

create index if not exists comment_reports_reporter_created_idx
  on public.comment_reports (reporter_wallet, created_at desc);

alter table public.comment_reports enable row level security;

revoke all on table public.comment_reports from anon, authenticated;
grant select, insert, update, delete
  on table public.comment_reports to service_role;

comment on table public.comment_reports is
  'Server-only wallet-signed reports for BNBX project comments.';
