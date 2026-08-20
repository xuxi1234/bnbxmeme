drop function if exists public.futures_fill_list(text, integer);

create function public.futures_fill_list(
  p_wallet text,
  p_limit integer
) returns table(
  chain_id smallint,
  order_book text,
  tx_hash text,
  log_index integer,
  block_number bigint,
  block_hash text,
  maker_order_id text,
  taker_order_id text,
  maker_wallet text,
  taker_wallet text,
  quantity text,
  price text,
  confirmed_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_wallet !~ '^0x[0-9a-f]{40}$'
     or p_limit < 1 or p_limit > 100 then
    return;
  end if;

  return query
    select
      f.chain_id,
      f.order_book,
      f.tx_hash,
      f.log_index,
      f.block_number,
      f.block_hash,
      f.maker_order_id,
      f.taker_order_id,
      f.maker_wallet,
      f.taker_wallet,
      f.quantity::text,
      f.price::text,
      f.confirmed_at
    from public.futures_fill_index as f
    where f.maker_wallet = p_wallet or f.taker_wallet = p_wallet
    order by f.block_number desc, f.log_index desc
    limit p_limit;
end;
$$;

revoke all on function public.futures_fill_list(text, integer)
  from public, anon, authenticated;
grant execute on function public.futures_fill_list(text, integer)
  to service_role;
