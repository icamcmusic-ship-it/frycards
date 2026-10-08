-- Extend Season 1 (Blue Coral) by one month: 2026-10-10 -> 2026-11-10.
-- Season 2 rows don't exist yet; this keeps the battle pass live meanwhile.
-- Already applied to the live project on 2026-10-08. Idempotent: sets the
-- absolute end time rather than adding an interval.
update public.seasons
   set ends_at = '2026-11-10 00:05:26.184997+00'
 where name = 'Season 1 — Blue Coral'
   and ends_at < '2026-11-10 00:05:26.184997+00';
