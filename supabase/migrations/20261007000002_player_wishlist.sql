-- 2026-10-07 (AUDIT-2026-10-06 §6 quick win 6): the Collection wishlist moves
-- from localStorage to the server, so it follows the account across devices.
-- The client keeps localStorage as an offline cache and merges it up once.
create table if not exists public.player_wishlist (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
alter table public.player_wishlist enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'player_wishlist' and policyname = 'own wishlist read') then
    create policy "own wishlist read" on public.player_wishlist for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'player_wishlist' and policyname = 'own wishlist insert') then
    create policy "own wishlist insert" on public.player_wishlist for insert with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'player_wishlist' and policyname = 'own wishlist delete') then
    create policy "own wishlist delete" on public.player_wishlist for delete using (user_id = auth.uid());
  end if;
end $$;
grant select, insert, delete on public.player_wishlist to authenticated;
