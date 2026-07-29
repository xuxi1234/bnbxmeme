alter table public.token_comments
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by text,
  add column if not exists moderation_reason text;

alter table public.token_comments
  drop constraint if exists token_comments_moderated_by_check,
  add constraint token_comments_moderated_by_check check (
    moderated_by is null or (
      moderated_by = lower(moderated_by)
      and moderated_by ~ '^0x[0-9a-f]{40}$'
    )
  ),
  drop constraint if exists token_comments_moderation_reason_check,
  add constraint token_comments_moderation_reason_check check (
    moderation_reason is null or char_length(moderation_reason) between 1 and 64
  );

create index if not exists token_comments_moderation_idx
  on public.token_comments (hidden, created_at desc);

create table if not exists public.comment_moderation_settings (
  id smallint primary key default 1 check (id = 1),
  comments_enabled boolean not null default true,
  blocked_terms text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text check (
    updated_by is null or (
      updated_by = lower(updated_by)
      and updated_by ~ '^0x[0-9a-f]{40}$'
    )
  ),
  constraint comment_moderation_terms_limit check (
    cardinality(blocked_terms) <= 200
  )
);

insert into public.comment_moderation_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.comment_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  admin_wallet text not null check (
    admin_wallet = lower(admin_wallet)
    and admin_wallet ~ '^0x[0-9a-f]{40}$'
  ),
  action text not null check (
    action in ('set_enabled', 'set_blocked_terms', 'set_hidden', 'delete')
  ),
  comment_id uuid,
  details jsonb not null default '{}'::jsonb check (
    jsonb_typeof(details) = 'object'
  ),
  created_at timestamptz not null default now()
);

create index if not exists comment_moderation_audit_created_idx
  on public.comment_moderation_audit (created_at desc);

alter table public.comment_moderation_settings enable row level security;
alter table public.comment_moderation_audit enable row level security;

revoke all on table public.comment_moderation_settings from anon, authenticated;
revoke all on table public.comment_moderation_audit from anon, authenticated;
grant select, insert, update, delete
  on table public.comment_moderation_settings to service_role;
grant select, insert, update, delete
  on table public.comment_moderation_audit to service_role;

grant select, insert, update, delete
  on table public.token_comments to service_role;

comment on table public.comment_moderation_settings is
  'Server-only switch and blocked terms for BNBX project discussions.';
comment on table public.comment_moderation_audit is
  'Server-only audit trail for BNBX comment moderation actions.';
