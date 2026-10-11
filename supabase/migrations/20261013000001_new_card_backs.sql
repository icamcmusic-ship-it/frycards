-- 2026-10-13: nine new card backs.
--
-- Art is committed at art/cardbacks/<slug>.webp (750x1050, 5:7, plus a
-- 375x525 thumb/) and published by the showcase-art workflow to the
-- frycards-showcase Cloudflare Pages project as CardBacks/<slug>.webp. Until
-- that deploy has run, the client falls back to the copy shipped with the app
-- in public/cardbacks/ (src/meta/cardBackAssets.ts).
--
-- Prices follow the existing backs (299 / 499 / 1199 + 12 vouchers), tiered
-- by rarity. Idempotent: rows are matched by name.

insert into public.shop_items
  (name, description, item_type, image_url, cost_credits, cost_vouchers, rarity, aspect_ratio, author)
select v.name, v.description, 'card_back',
       'https://frycards-showcase.pages.dev/CardBacks/' || v.slug || '.webp',
       v.credits, v.vouchers, v.rarity, 'portrait', 'FryBandit'
  from (values
    ('Salt & Stack',     'salt-and-stack',   'Dip into the deck.',                       299,  null::int, 'Common'),
    ('Doodle Deep',      'doodle-deep',      'Doodle your way to victory.',              299,  null,      'Common'),
    ('Glimmerroot',      'glimmerroot',      'Grow your deck in the dark.',              299,  null,      'Common'),
    ('Breach',           'breach',           'Break the surface. Break the deck.',       499,  null,      'Rare'),
    ('Ignited Palm',     'ignited-palm',     'Feel the heat in your hand.',              499,  null,      'Rare'),
    ('Shh Protocol',     'shh-protocol',     'Keep your hand a secret.',                 499,  null,      'Rare'),
    ('Hothead Protocol', 'hothead-protocol', 'Hot takes. Hotter draws.',                 799,  8,         'Super-Rare'),
    ('Hot Hand Ace',     'hot-hand-ace',     'Hot hand? Let it burn.',                   799,  8,         'Super-Rare'),
    ('Hellfry',          'hellfry',          'Hot out the fryer. Hotter on the table.',  1199, 12,        'Ultra-Rare')
  ) as v(name, slug, description, credits, vouchers, rarity)
 where not exists (
   select 1 from public.shop_items s where s.name = v.name and s.item_type = 'card_back'
 );
