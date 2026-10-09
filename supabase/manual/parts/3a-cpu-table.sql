create table if not exists public.market_listing_cpu (
  listing_id uuid primary key references public.market_listings(id) on delete cascade,
  cpu_ceiling int,
  cpu_next_at timestamptz
);
alter table public.market_listing_cpu enable row level security;
revoke all on table public.market_listing_cpu from public, anon, authenticated;

insert into public.market_listing_cpu (listing_id, cpu_ceiling, cpu_next_at)
select id, cpu_ceiling, cpu_next_at from public.market_listings
 where status = 'active' and (cpu_ceiling is not null or cpu_next_at is not null)
on conflict (listing_id) do nothing;
