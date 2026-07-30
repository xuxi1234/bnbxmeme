alter table public.comment_moderation_audit
  drop constraint if exists comment_moderation_audit_details_size,
  add constraint comment_moderation_audit_details_size check (
    pg_column_size(details) <= 8192
  );

create index if not exists comment_moderation_audit_action_created_idx
  on public.comment_moderation_audit (action, created_at desc);

create index if not exists comment_moderation_audit_admin_created_idx
  on public.comment_moderation_audit (admin_wallet, created_at desc);

comment on table public.comment_moderation_audit is
  'Server-only bounded audit trail for BNBX comment moderation actions and CSV export.';
