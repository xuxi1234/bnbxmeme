drop index if exists public.futures_effect_leases_expiry_idx;

create policy futures_matching_states_deny_direct_access
  on public.futures_matching_states
  as restrictive for all to public
  using (false) with check (false);

create policy futures_effect_leases_deny_direct_access
  on public.futures_effect_leases
  as restrictive for all to public
  using (false) with check (false);

create policy futures_fill_index_deny_direct_access
  on public.futures_fill_index
  as restrictive for all to public
  using (false) with check (false);
