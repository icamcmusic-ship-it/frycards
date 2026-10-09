update public.market_listings set cpu_ceiling = null, cpu_next_at = null
 where cpu_ceiling is not null or cpu_next_at is not null;

revoke execute on function public.settle_expired_listings() from public, anon, authenticated;
