# FryCards Store and Pack Opening: Proposal

Screenshots: `scratchpad/shopideas/shots2/` (store tabs and pack states at 390 and 1280). Preview harness: `meta-preview.html?screen=store|pack`.

## What exists today (live Supabase, read-only)

**Pack types (8 rows, 3 the player can actually get in the Store):**

| Pack | Status | Cards | Price | Art |
|---|---|---|---|---|
| Volume #1 Booster Pack | active, purchase | 8 | 599 cr / 6 vouchers | shared `boosterpackshop_icon.webp` + `boosterpackvertical.webp` |
| Volume #1 Booster Box | active, purchase | 49 | 3,799 cr / 38 v | `booster_box_shop_icon.webp` + `boosterboxvertical.webp` |
| Daily Free Pack | active, daily_free | 5 | free / 20h | reuses booster art |
| Season Pass Reward Pack | active, pass reward | 6 | n/a | reuses booster art |
| Deck Box | active, grant | 61 | n/a | none |
| Starter Pack, Starter Box, Players Showcase 2026 | inactive | | | mostly none |

So there are 2 pieces of pack art for the whole game, every 5-to-8-card pack wears the same wrapper, and nothing uses `time_limited`, `pack_group` or `pity_note`.

**Shop items (15):** 5 card backs, 9 profile banners, 1 avatar. 7 are season-pass exclusives, so the Store sells only 8: 2 card backs (Electric Glow 299, Golden Sown 1,199 cr / 12 v), 5 banners (199 to 499), 1 avatar (Smiling Face 299), plus the free Original Orange. All are Midjourney CDN URLs, which can expire. No item is limited, none has a foil variant. `player_cosmetics` holds 9 rows in total.

**Tabs:** PACKS group (Card Packs, My Packs, Bounties, Pack History) and COSMETICS group (Card Backs, Banners, Avatars). `StorePlus.tsx` is only the "+" wallet shortcut.

**Pack opening (`PackOpening.tsx`):** three stages, pack → reveal → summary. TearStage lets you click the pack, drag the foil strip, or press "Just tear it open for me", and has Skip to Summary. RevealStage flips one card at a time, shows a glow colour per rarity, a progress pip row, Reveal All and Next. SummaryStage shows stat tiles (cards, foils, new, top pull, haul value), a Best Pull hero, rarity chips, a card strip, Quicksell clutter, Open Next and a session recap. It also has a wishlist-hit badge, serialized handling and big-pull sound (`Sfx`). `packodds.ts` mirrors server odds and adds a 1% serialized extra. `packHistory.ts` is local to the browser only.

## (a) Store UI/UX problems seen, with fixes

| # | Problem (seen in screenshots) | Fix | Effort | Impact | File |
|---|---|---|---|---|---|
| A1 | At 1280px the Card Packs tab is one 360px tile in a 1100px empty grid. It feels empty and unfinished. | Use a storefront layout: hero banner on top, a "Featured" row, then a pack shelf. Cards span 2 columns on desktop. | M | High | StoreScreen.tsx |
| A2 | Pack art falls back to a flat slate box with the name printed in grey ("VOLUME #1 BOOSTER PACK"). Several packs (Deck Box, Showcase) have `image_url = null`. | Make a styled CSS wrapper fallback: crimp edges, colour band per tier, big Montserrat 900 logo and halftone. Never show a bare box. | S | High | StoreScreen.tsx `PackTile`, PackOpening `TearStage` |
| A3 | Each tile has 6 buttons (Buy & Open, Open with vouchers, Open 5, Open 10, Save for later x2). That's decision overload, with no clear primary action. | Show one primary BUY & OPEN with a currency toggle (credits / vouchers). Put "x1 / x5 / x10" in a segmented quantity stepper. Move "Save for later" to a checkbox or secondary menu. | M | High | StoreScreen.tsx PackTile |
| A4 | Copy contradicts itself. The description says "one guaranteed foil", the badge says "RARE+ GUARANTEED", and the DB `guaranteed_rarity` is Uncommon. The preview fixture shows 499 while live is 599. | Generate the badge and blurb from `slot_config` / `guaranteed_rarity` / `has_foil_slot`, and add a test that ties them together. | S | High (trust) | StoreScreen.tsx, packodds.ts |
| A5 | No bulk discount: Open 10 = 10 x price. The Box (49 cards at 3,799) has better value but the UI doesn't say so. | Add a "Cost per card" line and a "SAVE 21%" ribbon on the box and bundles. | S | Med | StoreScreen.tsx |
| A6 | The Daily Free Pack is a tiny strip with a placeholder thumbnail. It's the best retention hook but it gets the least visual weight. | Make it a big tile with the real wrapper, a live countdown ring when on cooldown, and a streak counter ("Day 4: bonus foil on day 7"). | M | High | StoreScreen.tsx |
| A7 | Cosmetics tabs list a handful of items in one small column. Desktop is almost entirely empty, and owned items look like disabled buttons. | Use a grid with large previews in context: a card back on a mock table hand, a banner on a mock profile header, an avatar in a seat ring. Add an "Equip" CTA when owned and a rarity frame colour. | M | High | StoreScreen.tsx cosmetics branch |
| A8 | Credits and vouchers chips in the header have no labels or explanation. The voucher icon is ambiguous. | Add a tap-to-explain popover ("Vouchers: earned from Bounties and the Pass, 1 v = about 100 cr"), with "how to earn" links. Label them "CR" and "V" at 390px. | S | Med | CurrencyBar.tsx, StorePlus.tsx |
| A9 | The PACKS/COSMETICS group switch plus the sub-tabs make two tab rows. "Pack History" is clipped behind a fade at 390px. | Merge into one scrollable chip row with icons, or move History and Bounties into an overflow. Keep My Packs as a badge on the header ("4 unopened" pill). | S | Med | StoreScreen.tsx |
| A10 | No preview of what's inside before buying. "View drop odds" is a text link to a table. | Add a "What's inside" drawer: a 6-card sample fan of top chase cards (Mythic/UR) from `allowed_sets`, the odds bar as a stacked rarity strip, and "You own 112/240 of this set". | M | High | StoreScreen.tsx PackOddsModal |
| A11 | Purchases give no feedback beyond the overlay. There is no confirmation for big spends. | Show a confirm sheet above 1,000 cr with the balance after purchase. Animate the wallet tick-down with a coin pop. | S | Med | StoreScreen.tsx, CurrencyBar.tsx |
| A12 | Cosmetic art is hot-linked from `cdn.midjourney.com`, so links can expire. | Re-host on `frycards-art.pages.dev/Shop_Cosmetics/...` like the pack art. | S | High (breakage) | DB `shop_items.image_url` |

## (b) New store features

| # | Feature | Notes | Effort | Impact | Touches |
|---|---|---|---|---|---|
| B1 | **Storefront hero** | Rotating full-width banner (set launch, limited pack, featured cosmetic) with a CTA and countdown. | M | High | StoreScreen.tsx, new `store_featured` table or a `shop_items.featured_until` column |
| B2 | **Daily deals rotation** | 3-4 slots refreshed at UTC midnight (same seed as Bounties): one discounted cosmetic, one pack bundle, one voucher deal. "Refreshes in 6h 12m". | M | High | StoreScreen.tsx, a new RPC `get_daily_deals` |
| B3 | **Bundles** | Starter bundle (3 packs + card back), Collector bundle (box + slab skin + banner), with a "Value 4,200, price 2,999" strike-through. | M | High | `shop_bundles` table, StoreScreen.tsx |
| B4 | **Limited-time packs** | Use the existing `time_limited` / `pack_group` columns: themed packs per colour (Ember pack, Tide pack: 8 cards weighted to one colour) and holiday packs. Show a "LEAVING IN 3D" ribbon. | M | High | pack_types rows, PackTile |
| B5 | **Pity / progress meter** | A visible meter "Mythic guaranteed within 40 packs: 27/40". `pity_note` already exists but is unused. Needs a server counter. | L | High | DB + `grant_pack_contents`, PackTile, SummaryStage |
| B6 | **Set completion tracker on the pack** | "Volume #1: 112/240 owned. This pack has an 18% chance of a new card." | S | Med | StoreScreen.tsx (collection already in MetaContext) |
| B7 | **Wishlist hooks** | Wishlist already exists (`isWishlisted`). In the Store, show "3 wishlisted cards can drop from this pack", and in Bounties highlight wishlisted cards. Notify when a wishlisted cosmetic goes on deal. | S | Med | StoreScreen.tsx, PackOddsModal |
| B8 | **Try-on / preview mode** | "Preview on table" opens a mock felt with the card back dealt, or a mock profile with the banner. | M | Med | new `CosmeticPreview.tsx` |
| B9 | **Currency clarity** | A "Get credits" panel: earn routes (matches, bounties, daily, pass) and an exchange rate. Show voucher price and credit price side by side on every item. | S | Med | StorePlus.tsx, CurrencyBar.tsx |
| B10 | **New cosmetic categories** | Table felts, avatar frames, chip skins, emotes, slab skins, pack-opening themes. Each is a new `item_type` and a new tab (see C). | L | High | StoreScreen.tsx tabs, `shop_items.item_type`, the table renderer |
| B11 | **First-purchase / returning-player offer** | A one-time "Welcome bundle" at half price. | S | Med | StoreScreen.tsx |
| B12 | **Gift a pack** | Send a sealed pack to a friend from Social. | L | Med | DB + SocialScreen.tsx |
| B13 | **Store-side "New" dots** | Badge new items since your last visit (local storage). | S | Low-Med | StoreScreen.tsx |

## (c) CONTENT LIST: what to make

Style: Monochrome & Pop. Thick ink outline (6-8px at source size), flat 2-3 colour fills plus halftone, flat offset shadow, Montserrat 900 type. Deliver PNG masters plus WebP exports, sRGB, on a transparent background where noted. Host at `frycards-art.pages.dev/<Folder>/<file>.webp`. Name files `snake_case`, with no spaces.

### C1. Pack wrappers (highest priority)
For each pack: a shop icon (`<pack>_shop.webp`, 800x1000, 4:5, transparent), a vertical tear wrapper (`<pack>_wrapper.webp`, 770x960, 77:96, matching TearStage's aspect), a top-strip foil crimp (`<pack>_strip.webp`, 770x160), and a back of the torn wrapper (`<pack>_inner.webp`, 770x960).
- Volume #1 Booster Pack (redo, so it is distinct from the daily pack)
- Daily Free Pack (its own look: a "FREE" stamp and a lighter colourway)
- Season Pass Reward Pack (pass-branded)
- Deck Box and Starter Box (box: `<pack>_box_front.webp` 1000x1000 plus lid `<pack>_box_lid.webp`)
- Players Showcase 2026
- 7 colour packs for limited rotation: Ember, Tide, Root, Gale, Light, Shadow, Void
- 2 seasonal or holiday packs
**Count: about 14 packs x 4 files = 56 images.** Also 1 box-open sequence for the Booster Box (lid off, 3 frames, or one Lottie).

### C2. Rarity leak / glow overlays
Six rarity tints (Common, Uncommon, Rare, Super-Rare, Ultra-Rare, Mythic), plus Alt-Art and Serialized. `leak_<rarity>.webp`, 770x960, additive light-ray mask. Can be one greyscale mask tinted in CSS, which makes this 1 image, not 8. A Mythic burst sprite sheet: `burst_mythic.webp`, 8 frames x 512px. **Count: about 3 assets.**

### C3. Card backs
Today 5 exist (2 buyable). Target 16: 6 store base, 4 premium/foil, 4 season-pass, 2 event. `cardback_<slug>.webp`, 750x1050 (5:7), with a 30px safe-area border. Foil variants need a separate `cardback_<slug>_foilmask.png` greyscale mask for the shimmer. **Count: about 11 new + 4 masks.**

### C4. Table felts (new category)
`felt_<slug>.webp`, 2400x1350 (16:9) tileable centre plus a 1080x1920 mobile crop, with a centre safe zone for community cards. Ideas: Classic Green, Ink Noir, Halftone Red, one per colour (7), and Comic Panel. **Count: about 10 x 2 crops = 20.**

### C5. Avatars and avatar frames
Avatars: only 1 is buyable. Make 12 to 20 `avatar_<slug>.webp` at 512x512, 1:1, ink-style faces. Frames: `frame_<slug>.png` at 640x640, transparent centre circle at 512. Use one frame per rarity tier (6) plus pass and event frames (4). **Count: about 16 avatars + 10 frames.**

### C6. Profile banners
9 exist. Add 8: `banner_<slug>.webp`, 1500x500 (3:1), with a left-third safe zone for the avatar. **Count: 8.**

### C7. Chip skins (new)
`chips_<slug>.png`, a sprite sheet of 5 denominations x 256px, transparent, top-down. 6 sets. **Count: 6 sheets.**

### C8. Emotes (new)
`emote_<slug>.png`, 256x256 transparent, plus an optional 12-frame 256px sprite for animated ones. Poker reactions: Nice Hand, Bluff?, All In, GG, Tilted, Fry. Base set of 12, premium animated 6. **Count: 18.**

### C9. Graded slab skins (new, for GradedSlab / SlabCase3D)
`slab_<slug>_front.png` and `_label.png`, 900x1300, transparent window cut-out. Gold, Ink Noir, Holo, one per grading house. **Count: about 6 x 2 = 12.**

### C10. Store chrome
- Hero banners: `hero_<campaign>.webp`, 2400x800 desktop + 1080x1080 mobile. 4 to start (Vol #1 launch, Colour Week, Season, Holiday). **8 files.**
- Deal/bundle badges and ribbons ("LIMITED", "SAVE 20%", "NEW", "LEAVING SOON"): SVG, about 6. These can be built in CSS instead.
- Bundle key art: `bundle_<slug>.webp` 1200x800, about 3.
- Currency icons redrawn in house style: credits and vouchers, SVG 24 and 64. **2 to 4.**
- Store mascot or shopkeeper spot illustration for empty states: 1 to 3 PNGs at 800x800.

### C11. Pack opening themes (premium cosmetic, optional)
Burst background plus particles plus sound set. `opentheme_<slug>/bg.webp` 2048x2048, `particles.png`, `sfx/*.ogg`. **2 to 3 themes.**

### C12. Audio (hooks in D)
OGG + MP3, 48kHz, under 60KB each, -14 LUFS. Files: `sfx_pack_shake`, `sfx_tear_start`, `sfx_tear_loop`, `sfx_tear_finish`, `sfx_flip`, `sfx_reveal_common`, `_uncommon`, `_rare`, `_sr`, `_ur`, `_mythic` (sting, about 2s), `sfx_serialized`, `sfx_new_card`, `sfx_summary`, `sfx_coin`, `sfx_purchase`. **About 16 files.**

### C13. Mythic video moments
One per Mythic card, or one generic: `mythic_<cardId>.webm` (VP9 + alpha) and an MP4 fallback, 1080x1350, 3 to 4s, under 1.5MB. Start with 1 generic + a per-colour tint. **1 to 7.**

**Approximate total for a first wave:** 56 pack + 3 FX + 15 backs + 20 felts + 26 avatar/frames + 8 banners + 6 chips + 18 emotes + 12 slabs + about 20 chrome + 16 sfx + 1 to 7 video. About 200 files. A minimum viable set is the C1 core packs (6 x 4 = 24), 6 card backs, 4 felts, 2 heroes, 12 sfx, and 6 avatars.

## (d) Pack opening upgrades

| # | Upgrade | Detail | Effort | Impact | File |
|---|---|---|---|---|---|
| D1 | **Real wrapper in the tear stage** | Today a slate box with "PREVIEW PACK" text appears whenever `open_image_url` is null. Use C1 art or the CSS fallback from A2. | S | High | PackOpening.tsx TearStage |
| D2 | **Anticipation: shake + rarity leak** | The best pull is already known client-side. Before the tear, the pack wobbles harder for higher rarity, and the tier colour leaks through the crimp seam (CSS mask + `--leak` colour). SR+ adds a light crack along the strip. Use honest tiers only (best pull ≥ Rare). | M | High | TearStage, rarity.ts |
| D3 | **Better tear interaction** | Make the strip follow the finger with a paper-curl transform. Spawn FoilScraps along the path and add haptics (`navigator.vibrate(8)`) every 10%. On release past 60% it auto-completes with a snap. The pack then slides down to reveal the stack top. | M | Med-High | TearStage |
| D4 | **Card stack and fan** | After the tear, the cards rise as a stacked deck. Swipe up or tap to deal each card. Commons/uncommons auto-flip in quick succession ("fast-lane"), then the remaining stack holds the rares last, ordered by rarity. Optional fan mode on desktop: all backs fanned, click any to flip. | M | High | RevealStage |
| D5 | **Per-rarity reveal tiers** | C/U: quick flip, no pause. Rare: blue edge glow plus a click sfx. SR: 400ms hold plus a halftone burst. UR: screen dim, card spins once, then ink-splat burst. Mythic: full-screen takeover with the C13 video or CSS burst, the card name stamped in Montserrat 900, and a 1.5s lock before Next. Serialized: a stamped "#023/250" plate drops in. Alt-Art / Full-Art: an art-only zoom pan before the frame appears. | M-L | Very High | RevealStage, new `revealTiers.ts` |
| D6 | **Foil shimmer** | Pointer- and gyro-driven holographic gradient over foils (CSS `background-position` via `--mx/--my`), using card foil masks where present. | S-M | High | RevealStage, shared Card component |
| D7 | **Skip / auto** | Settings has "Auto-reveal", "Skip commons" and "Instant open". Long-press Next means fast-forward to the next Rare+. Keep Reveal All. Remember the choice per device. | S | Med-High | RevealStage, SettingsScreen.tsx |
| D8 | **Sound hooks** | Wire C12 sfx through the existing `Sfx` path: shake, tear loop scrubbed by progress, flip, rarity stings, summary fanfare, coin on quicksell. Respect mute. | S | High | PackOpening.tsx, sound module |
| D9 | **Summary hero** | Best Pull already exists. Enlarge it with a rarity-coloured burst backdrop and a "NEW" sticker. Add a 3D tilt on hover. If it's serialized, show the print number big. | S | High | SummaryStage |
| D10 | **Per-card badges in the grid** | NEW (yellow sticker), DUPE x3 (grey), SERIALIZED #, FOIL, WISHLIST HIT. Currently only "Foil" and the New count tile show. Sort by rarity desc, collapse commons to "+4 commons". | S | High | SummaryStage |
| D11 | **Value total and set progress** | Animate "Haul value 648" counting up. Add "Set progress 112 → 116/240" bar and "Pity meter +1" (if B5). | S | Med | SummaryStage, StatTile |
| D12 | **Quick actions** | Per card: Add to deck, Wishlist, Grade, List on market, Quicksell. Global: Quicksell dupes (exists), Open Next (exists), "Buy another" with price, View in Collection. | M | Med-High | SummaryStage |
| D13 | **Share** | "Share pull" renders a 1080x1350 PNG (best pull + pack wrapper + username + serial) via canvas or `html-to-image`, using Web Share API or a download fallback. | M | Med (growth) | new `shareCard.ts`, SummaryStage |
| D14 | **Multi-pack sessions** | For Open 5/10: show a session progress bar ("Pack 3/10"). The session recap shows the best of each pack in a row, plus the session's top pull hero. | M | Med | PackOpening.tsx session recap |
| D15 | **Pack history upgrade** | `packHistory.ts` is local only. Mirror it to the server so it shows on every device, and show "best pull ever" and a luck stat. | M | Low-Med | packHistory.ts, DB |
| D16 | **Accessibility / reduced motion** | Gate shake, burst and video behind `prefers-reduced-motion` (MotionRoot), keeping colour and text announcements. | S | Med | PackOpening.tsx |
| D17 | **Fix harness / mobile summary path** | In my 390px Playwright run, pressing Reveal All after a flip did not reach the summary (the screenshot showed the sealed pack again). It works at 1280. Investigate: possibly a remount via `seq`, or a click landing on an overlay. | S | Med | PackOpening.tsx, meta-preview |

## Priority order (top 10)
1. D1 + A2: real pack wrappers and a styled fallback. Kill the slate placeholder everywhere. (S, needs C1 art)
2. A1 + B1: storefront layout with hero and featured row, so desktop isn't empty. (M)
3. D5: per-rarity reveal tiers with a Mythic takeover. (M-L)
4. A3: simplify the pack tile CTAs into one primary button plus a quantity stepper. (M)
5. B2 + B4: daily deals rotation and limited-time / colour packs, using the existing `time_limited` / `pack_group` columns. (M)
6. D2 + D3: pack shake, rarity leak and a better tear. (M)
7. D10 + D9 + D11: summary badges, hero and animated value/set progress. (S)
8. A10 + B7: a "What's inside" preview with a chase-card fan, owned-set progress and wishlist hits. (M)
9. D8 + D6: sound hooks and foil shimmer. (S, needs C12 audio)
10. B5: a visible pity meter. (L, server work) Alongside it: A4 copy/odds consistency and A12 re-hosting of the Midjourney URLs, which are cheap trust and breakage fixes.
