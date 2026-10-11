# CPU buyers: personas, haggling and backend cost

Migrations: `20261013000100_cpu_buyer_personas.sql` and `20261013000101_shop_haggle_log_opening.sql`, both applied live on 2026-10-11.
Pending (it contains a DELETE): `20261013000190_pending_cpu_buyer_personas.sql`.
Tests: `supabase/cpu-buyer-personas.test.ts` (pglite) and `src/meta/buyers/dialogue.test.ts`.

## Personas

There are 20 personas in `cpu_buyer_personas`, mirrored for display in `src/meta/buyers/personas.ts`:

- 13 archetypes: tightfist, kid, slabsnob, foilhunter, completer, flipper, veteran, pristine, bargain, whale, gambler, rival, tourist.
- 7 colour loyalists, one per colour: Ember, Gale, Light, Root, Shadow, Tide and Void.

Each persona has these fields:
- a name pool of 3 names (the 14 legacy names are all included, so old rows still resolve);
- a budget band (`budget_lo..budget_hi`, times the reference value);
- a hard `max_mult`;
- a hidden walk-away headroom (`give`);
- `patience` (1–3 counters), a `concession` curve and a `temper`;
- tastes: colour, rarities, grading house, foil, slab, variant and Pristine;
- `trade_rate`;
- an auction `bid_style`.

Spawning weights each persona by `1 + 2·taste hits (+2 if a regular)`. Every taste hit adds +5% to the offer, up to 4 hits.

## Offers (server-authoritative)

- Every offer and walk-away is at most `min(asking price, 1.6 × reference)`, after all bonuses: taste, reputation (≤ +8%) and regular (+3%).
- **Bundle:** 20% of plain individual listings pair with a second listing at 92% of the combined reference. The cap is the sum of the two asking prices.
- **Trade plus cash:** the cash is half the value gap, capped at 30% of the reference and at the asking price.
- **Reputation:** `shop_reputation_bonus` = an unlocked rating (0–5 → 0–5%) + 0.3% for each accepted deal in the last 7 days (at most 10 deals). The total is capped at 8%.
- **Regulars:** `shop_regulars(owner, persona_id)` stores visits and good deals. A customer counts as a regular when visits > 1 and good_deals > 0. A regular arrives with +15 mood, a +3% budget and double spawn weight. A walk-out costs one good deal.

## Haggling (`respond_shop_customer`, one RPC per action, deterministic)

Actions are `accept`, `decline`, `counter` and `final`. A counter must be above the current offer and at most the asking price.

The effective walk-away is `walk × (1 + (mood−50)/500)` when mood is above 50, capped at the asking price. Against a counter `c`:

| condition | event | effect |
|---|---|---|
| c ≤ walk | sale at c | |
| `final` and c > walk | walkout | |
| c/walk > 1.4 | insulted | mood −temper; walks if mood ≤ 15 or patience is used up |
| 1.15 < c/walk ≤ 1.4 | threat | mood −12; offer moves 25% of the way toward walk |
| otherwise | meet_middle | mood −3; offer moves `concession` of the way toward c |

- The last counter allowed by patience becomes `final_offer` at the walk-away price.
- Mood at or below 10 always walks out.
- `event_log` records `offer` / `counter` / `final` / events, so the client can replay the conversation exactly.

## Dialogue

- `src/meta/buyers/dialogue.ts` is a lazy chunk (`dialogue-*.js`, 9.6 kB gzip) and is not part of the eager bundle.
- It holds 760 lines: 20 personas × 19 moments × 2 lines.
- A line is picked by FNV-1a hash of (customer seed, moment, salt), so a reload shows the same line.
- No dialogue text is stored in the database.

## Auction bidders

- `run_cpu_bidders` assigns each listing a persona deterministically (`md5(persona id || listing id)`). The bidder name comes from that persona's pool.
- Bid jumps by style:
  - sniper: bids only inside the last 20 minutes, +5–10%;
  - early_bird: +10–20%;
  - steady: +0–5%;
  - bluffer: +10–30%.
- Every bid stays capped by the existing ceiling and by buyout − 1.
- A sniper schedules its next check close to the snipe window instead of polling.
- The Marketplace shows the persona badge and bid style next to "(CPU) leads".

## Backend cost

### Baseline (live, before the change: `pg_stat_statements` and cron history for the last 24 h)

| what | calls | mean | total |
|---|---|---|---|
| cron `settle-market-and-cpu-bidders` (*/5) | 288 runs/day | 10.9 ms (max 46.6) | ~3.1 s/day |
| `select settle_expired_listings()` (all-time) | 1 173 | 12.3 ms | 14.5 s |
| gated cron statement (`where exists active`) | 124 | 0.27 ms | 33 ms |
| `get_shop_customers` via PostgREST | 9 | 9.7 ms | 87 ms |
| `spawn_shop_customers` / `respond_shop_customer` | (inside the above) | | |

Arrivals were already computed on read. No cron ever spawned customers.

### Changes

1. **Deterministic, lazy arrivals.**
   - `spawn_shop_customers` draws every choice (listing, persona, name, offer, bundle, trade) from `md5(owner : 90-min bucket : arrival# : listing)`. Refreshing, or calling concurrently, gives the same result. A declined customer does not bring the next one forward.
   - Between arrivals the function exits after one primary-key lookup, with no row lock. It only expires overdue rows.
2. **Rows kept, and why.**
   - A customer row exists only while it is waiting or once it is resolved: at most 8 per shop per day, the existing daily cap.
   - The row holds the in-progress haggle (mood, rounds, log), and that row is what prevents rerolls. Fully virtual customers would need the same row the moment a haggle starts, so there was little to save.
3. **No polling.** The 3-minute `setInterval` on the Shop Floor became a single `setTimeout` at `next_at`. Each player action is exactly one RPC.
4. **Auctions.**
   - `run_cpu_bidders` returns at once when no open auction is due, using the new partial index `market_listings_auction_open_idx` and `market_listing_cpu_next_idx`.
   - The cron gate is narrower. It runs settlement only when a listing has ended or an auction is open to CPU bids, so ticks where every live auction is already CPU-led and not yet ended are skipped.
   - The stale-row cleanup DELETE moved into the pending file.
5. **Indexes.**
   - `shop_customers_waiting_idx (owner) where status='waiting'`
   - `shop_customers_bundle_listing_idx`
   - `market_listing_cpu_next_idx`
   - `market_listings_auction_open_idx`
6. **Realtime.** No new channels were added.

### After (pglite timings from `cpu-buyer-personas.test.ts › timing`; Postgres is typically faster)

| path | pglite |
|---|---|
| spawn (an arrival is due; full persona and offer pick) | ~49 ms, at most once per 90 min per shop |
| Shop Floor refresh between arrivals (early exit) | ~2.3 ms |
| idle `run_cpu_bidders` tick (nothing due) | ~0.5 ms |

### Estimates per active shop owner

- **RPCs per hour with the Shop Floor open:** 20 before, from the 3-minute poll. About 1 now (one load, plus one timer reload per 90-minute arrival), plus one per haggle action.
- **Rows written per day per shop:**
  - ≤ 8 `shop_customers` inserts;
  - ≤ 8 `shop_regulars` upserts;
  - ≤ 16 `player_shops` updates (one per arrival bucket, as before);
  - 1–4 updates per haggled customer.
  - Under ~60 in total, all bounded by the daily cap.
- **Cron:** still 288 ticks a day. Most ticks now stop at the gate (~0.3 ms). A working tick processes at most 40 due auctions, as before. No cron touches shops.
