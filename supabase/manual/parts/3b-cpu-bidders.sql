create or replace function public.run_cpu_bidders()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  v_l market_listings%rowtype;
  v_ceiling int;
  v_ends timestamptz;
  v_rarity text;
  v_unit int;
  v_min int;
  v_bid int;
  v_acted int := 0;
begin
  for v_l in
    select m.* from market_listings m
      left join market_listing_cpu c on c.listing_id = m.id
     where m.status = 'active' and m.listing_type = 'auction' and m.ends_at > now()
       and (c.cpu_next_at is null or c.cpu_next_at <= now()) and not m.cpu_leading
     order by m.ends_at limit 40
     for update of m skip locked
  loop
    select cpu_ceiling into v_ceiling from market_listing_cpu where listing_id = v_l.id;
    if v_ceiling is null then
      select rarity into v_rarity from cards where id = v_l.card_id;
      v_unit := card_sell_price(v_rarity);
      if v_l.foil then v_unit := ceil(v_unit * 2.5)::int; end if;
      if v_l.price > v_unit * v_l.quantity then
        v_ceiling := 0;
      else
        v_ceiling := greatest(1, round(v_unit * v_l.quantity * cpu_ceiling_factor(
          v_l.seller::text || '|' || v_l.card_id || '|' || v_l.foil::text || '|' ||
          (now() at time zone 'utc')::date::text))::int);
      end if;
      insert into market_listing_cpu (listing_id, cpu_ceiling) values (v_l.id, v_ceiling)
        on conflict (listing_id) do update set cpu_ceiling = excluded.cpu_ceiling;
    end if;

    v_min := case when v_l.current_bid is null then v_l.price
                  else v_l.current_bid + greatest(1, ceil(v_l.current_bid * 0.05)::int) end;

    if v_min <= v_ceiling
       and (v_l.buyout is null or v_min < v_l.buyout)
       and (select count(*) from market_listings
             where seller = v_l.seller and status = 'sold' and cpu_bidder_name is not null
               and current_bidder is null and ends_at > now() - interval '24 hours') < 8
    then
      v_bid := least(v_ceiling, v_min + floor(v_min * random() * 0.15)::int);
      if v_l.buyout is not null then v_bid := least(v_bid, v_l.buyout - 1); end if;
      v_bid := greatest(v_bid, v_min);
      if v_l.current_bidder is not null then
        update profiles set credits = credits + v_l.current_bid, updated_at = now()
         where id = v_l.current_bidder;
      end if;
      update market_listings
         set current_bid = v_bid, current_bidder = null, cpu_leading = true,
             cpu_bidder_name = coalesce(cpu_bidder_name, cpu_persona_name()),
             bid_count = bid_count + 1,
             ends_at = greatest(ends_at, now() + interval '5 minutes')
       where id = v_l.id
       returning ends_at into v_ends;
      v_acted := v_acted + 1;
    else
      v_ends := v_l.ends_at;
    end if;

    insert into market_listing_cpu (listing_id, cpu_next_at)
    values (v_l.id, now() + case
             when v_ends - now() < interval '15 minutes' then interval '5 minutes'
             else make_interval(mins => 10 + floor(random() * 50)::int) end)
    on conflict (listing_id) do update set cpu_next_at = excluded.cpu_next_at;
  end loop;

  delete from market_listing_cpu c
   using market_listings m
   where m.id = c.listing_id and m.status <> 'active';
  return v_acted;
end;
$function$;
revoke all on function public.run_cpu_bidders() from public, anon, authenticated;
