create table public.chain_data_cache (
  chain_id integer not null,
  curve_address text not null,
  token_address text,
  latest_block bigint not null,
  payload jsonb not null,
  refreshed_at timestamptz not null default now(),
  primary key (chain_id, curve_address),
  constraint chain_data_cache_curve_address_check
    check (curve_address ~ '^0x[0-9a-f]{40}$'),
  constraint chain_data_cache_token_address_check
    check (token_address is null or token_address ~ '^0x[0-9a-f]{40}$'),
  constraint chain_data_cache_payload_check
    check (
      jsonb_typeof(payload -> 'trades') = 'array'
      and jsonb_typeof(payload -> 'holders') = 'array'
    )
);

create index chain_data_cache_refreshed_at_idx
  on public.chain_data_cache (refreshed_at desc);

alter table public.chain_data_cache enable row level security;

revoke all on table public.chain_data_cache from anon, authenticated;
grant select, insert, update, delete on table public.chain_data_cache to service_role;

comment on table public.chain_data_cache is
  'Server-only cache of public BSC bonding-curve events. The chain remains the source of truth.';
