# Card submissions, approval, art and the Creator card editor

How a player-designed card becomes a live card, where its art goes, and how
the Creator hand-edits any card. Written 2026-10-12, from the code and the
live database (project `dnngihsbqxccqvvedvjc`).

## Part 1 — How it worked before this change

### 1. A player submits

`CARD SUBMISSIONS` → `SUBMIT A CARD` (`src/meta/CardSubmissionsScreen.tsx`).
The player gives a title, a type (Unit / Item / Event / Location), flavor text,
a requested treatment (standard / full art / video Mythic) and an **https link
to the art**. There is no upload. `validateSubmission`
(`src/meta/submissions.ts`) checks it and rejects links into this project's
Supabase storage (`isMeteredStorageUrl`), because those are billed egress.
`submit_card` (RPC, SECURITY DEFINER) re-validates and inserts a
`card_submissions` row with `status = 'pending'`.

**Where the image lives:** wherever the player's link points (usually a
generator CDN). There is no Supabase storage bucket for submissions; the live
project has none at all.

### 2. The Creator reviews

`REVIEW QUEUE` tab (Creator role only) calls `get_card_submissions`. Each
pending row shows a live card preview built by `deriveCardMechanics`
(`src/game/poker/cardpool.ts`) from `id|type|rarity`, plus fields for id,
rarity, type, name, art URL, flavor and an override editor (tier, effect,
modifiers, subtype, rules text → `template.overrides`).

### 3. Approval

One click: `creator_review_submission(p_id, 'approve', …)`. In one transaction
it enforces the per-player Full-Art / Mythic caps, calls `apply_card_upsert`
(which validates and **inserts the `cards` row**: template jsonb plus the
mechanics columns the client sent from `mechanicsFor`), and marks the
submission approved.

- **Mechanics:** rolled deterministically from the hash; overrides layered on.
- **Art URL:** the player's link, copied into `cards.image_url` and
  `template.image` unchanged.
- **Packs / game:** `grant_pack_contents` picks from the `cards` table by
  rarity (and the pack's `allowed_sets`), so the card is packable at once. The
  client loads the catalog from `cards` at boot, cached with
  `versionedFetch` + `get_catalog_version` (an md5 over every template), so a
  new card reaches players on their next load with no redeploy.

### 4. Art to Cloudflare

Nothing did this. The main catalog art reached `frycards-art.pages.dev` by
hand: `npm run art:pages -- build <local folder>`, then
`npx wrangler pages deploy …` from a laptop, then `art:pages -- rewrite` and a
commit to `generated-cards.ts`. `art-pipeline.yml` only talks S3 to Supabase
storage (its schedule is disabled). An approved Showcase card would keep
hot-linking the player's URL indefinitely.

### Manual steps and pain points (before)

1. Art never left the player's link: it can expire, be hotlink-blocked, or be a
   6 MB PNG on every card view. Nothing reported it.
2. Moving art to Cloudflare meant a local build, a local `wrangler` login and
   deploy, a catalog rewrite and a commit.
3. `verify:pool` (run in CI) fails on any card that is live but not in
   `generated-cards.ts` ("live-only — run npm run fetch:cards"). **The first
   approved submission would have turned CI red** until someone ran
   `fetch:cards` and committed.
4. Bug: `card_submissions.card_type` has a CHECK listing the retired `Charm`,
   not `Item`, while `submit_card` and the form both offer `Item`. Every Item
   submission fails at insert. The fix needs a DROP CONSTRAINT and is in
   `supabase/migrations/20261012000092_pending_showcase_cleanup.sql`, not yet
   applied.
5. The override editor could not change colours, a Leader's abilities or a
   Location's rule, and could not be used on an existing live card.
6. State of the live project on 2026-10-12: 0 submissions, 0 Showcase cards,
   297 cards, no storage buckets.

## Part 2 — The new flow

```
player submits link ──► pending ──(Creator: APPROVE, one RPC)──► approved
                                        │  cards row minted, rolled mechanics,
                                        │  art = player's link (works at once)
                                        ▼
                               art_status = pending   "ART PENDING"
                                        │  manual Action run (daily fallback)
                                        ▼
       download → sharp webp 1200px / ffmpeg 480p mp4 → Cloudflare Pages
                                        ▼
         art_pipeline_report: cards.image_url + template.image rewritten
                               art_status = published  "ON CLOUDFLARE"
                               (or failed + reason      "ART FAILED" → RETRY)
```

- **Approve** is still one RPC. `creator_review_submission` now also sets
  `art_status = 'pending'`. The card is playable and packable immediately with
  the original link; approval never waits for the upload.
- **Upload**: `.github/workflows/showcase-art.yml` runs
  `scripts/publish-showcase-art.ts`. **Run it by hand** after approving cards:
  Actions → _Showcase art_ → _Run workflow_, with inputs `dry_run` (list the
  queue, change nothing), `limit` (1–25 cards this run) and an optional
  `reason` for the log. Locally: `npm run art:showcase -- --dry-run --limit=5`.
  A daily schedule (06:17 UTC) is only a fallback: its first step asks the
  GitHub API (`GITHUB_TOKEN`, `actions: read`) for successful
  `workflow_dispatch` runs of this workflow in the last 7 days and exits
  early if there are any, so it only does work when nobody has run it by hand
  for a week. A successful manual dry run also counts as a manual run. It makes one
  RPC (`art_pipeline_jobs`); an empty queue ends the run there. Otherwise it
  downloads each original, encodes it with the main pipeline's settings
  (`scripts/lib/derive.ts` master webp; the `shrink-video-art.ts` ffmpeg
  recipe for video), names it by content hash (`cards/<id>-<sha>.webp`) and
  deploys to the Pages project **`frycards-showcase`**. Because a Pages deploy
  replaces the whole site, it first re-downloads every already-published file
  from the live site and refuses to deploy if any is missing. One more RPC
  (`art_pipeline_report`) writes the results.
- **Cosmetics mirror**: the same run protects the store's cosmetics. Every
  `shop_items.image_url` hot-linked from a host that isn't ours (today all of
  them are on `cdn.midjourney.com`) is downloaded, converted to the same webp
  master and published as `Cosmetics/<id>.webp` in the **same**
  `frycards-showcase` deployment. Already-mirrored cosmetics are re-downloaded
  into every deployment, exactly like published cards, and the run refuses to
  deploy if any of them can't be fetched. Two token-checked RPCs
  (20261012000008): `cosmetics_mirror_jobs(token)` lists the items, and
  `cosmetics_mirror_report(token, results)` repoints `image_url` —
  compare-and-set, so an item edited in the meantime is left alone. A failed
  download leaves the item hot-linked for the next run. `dry_run` prints every
  card and cosmetic that would change (WOULD PUBLISH / WOULD MIRROR) and
  touches nothing; `limit` caps cards and cosmetics separately. Cosmetic files
  are named by id, not content hash, so they are cached for a day rather than
  forever. Animated sources become a still webp.
- **Why a separate Pages project:** `frycards-art` is built from a local copy
  of the bucket that CI does not have; deploying to it from CI would wipe it.
  R2 is not enabled on the Cloudflare account (API: "Please enable R2").
- **Catalog**: the report rewrites `template.image`, which changes
  `get_catalog_version()`, so every client's `versionedFetch` refetches the
  catalog on its next load. No polling, no redeploy.
- **Retention**: the player's original link is kept on
  `card_submissions.image_url` and never deleted (nothing is stored on
  Supabase to delete).
- **DB load**: one RPC per approval; two small RPCs per Action run that has
  work, one when idle; no client polling. The pipeline state rides along in
  the review-queue fetch (`get_card_submissions_v2`).
- **verify:pool**: live-only cards in the `Players Showcase 2026` set are now
  allowed and checked against their own live template. Mechanics columns are
  checked against the **live** template too, so in-app edits are not drift.
  Chosen over an Action that commits `generated-cards.ts`: that would need a
  write token, race other branches, and still leave CI red between approval
  and merge. Non-Showcase live-only cards still fail, as before.

### What you must set up (once)

| Where                                               | Name                     | What                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions secret                               | `ART_PIPELINE_TOKEN`     | any random string, ≥ 24 chars (e.g. `openssl rand -hex 24`)                                                                                                                                                                                                                                           |
| Supabase SQL (as Creator in the app, or SQL editor) | —                        | `select creator_set_art_pipeline_token('<same string>');` (in the SQL editor, which has no Creator session: `insert into art_pipeline_secret (id, token_hash) values (1, encode(sha256(convert_to('<same string>','UTF8')),'hex')) on conflict (id) do update set token_hash = excluded.token_hash;`) |
| GitHub Actions secret                               | `CLOUDFLARE_API_TOKEN`   | API token with **Account → Cloudflare Pages → Edit**                                                                                                                                                                                                                                                  |
| GitHub Actions secret                               | `CLOUDFLARE_ACCOUNT_ID`  | the account id from the Cloudflare dashboard                                                                                                                                                                                                                                                          |
| Actions variable (optional)                         | `SHOWCASE_PAGES_PROJECT` | default `frycards-showcase` (created on first run)                                                                                                                                                                                                                                                    |
| Actions variable (optional)                         | `SHOWCASE_ART_BASE_URL`  | default `https://<project>.pages.dev`                                                                                                                                                                                                                                                                 |

Without `ART_PIPELINE_TOKEN` the job succeeds doing nothing; without the
Cloudflare pair it reads the queue and leaves it pending. Cards keep their
original art either way.

### Database objects (migration `20261012000004_showcase_art_pipeline.sql`, applied live)

- `card_submissions.art_status / art_url / art_error / art_updated_at`
- `art_pipeline_secret` (one row, SHA-256 of the token; RLS on, no grants)
- `art_pipeline_jobs(token, limit)`, `art_pipeline_report(token, results)` —
  callable with the public key but useless without the token; a report only
  touches rows that are `approved` and still `pending`.
- `creator_set_art_pipeline_token`, `creator_retry_submission_art`,
  `get_card_submissions_v2` (Creator only).

### Uploaded art (migration `20261013000002_submission_art_uploads.sql`, applied live)

Players can now **upload the art file** instead of pasting a link (the link
stays as the PASTE LINK fallback).

- **Bucket** `submission-art`, private: 8 MB, `image/png`, `image/jpeg`,
  `image/webp`, plus `video/mp4` / `video/webm` (video only for the video
  Mythic treatment, the same rule `submit_card` applies to links).
- **RLS on `storage.objects`**: an uploader may INSERT only
  `<own uid>/<file>` (one level), while not submission-banned and with fewer
  than **3 pending uploads** (uploads not yet attached to a reviewed
  submission, orphans included). Only the Creator may SELECT. No UPDATE or
  DELETE policy, so players cannot overwrite or delete anything.
- **Client** (`SubmitPanel` in `CardSubmissionsScreen.tsx`,
  `src/meta/submissions.ts`): drag-drop or file picker, a local preview, a
  5:7 crop preview with an aspect hint, client-side type/size/treatment
  checks (`validateArtFile`), and upload progress. The browser uploads
  **straight to Storage** (XHR, for progress) as `<uid>/<uuid>.<ext>` when
  the player presses SUBMIT, then calls `submit_card_art(name, type,
flavor, art_path, treatment)`. If the submit step fails, the uploaded path
  is reused on retry. No polling anywhere.
- `submit_card_art` checks the path is the caller's and the object exists,
  then reuses `submit_card`'s validation with the placeholder image
  `https://submission-art.invalid/<path>` (the column is NOT NULL), and
  records `card_submissions.art_path`. An approved upload's card shows that
  placeholder (a blank frame) until the next workflow run publishes the art.
- **Review**: the Creator screen previews the original through a 1-hour
  signed URL (`signedSubmissionArtUrl`); approval keeps sending the
  placeholder, never the signed link.
- **Pipeline**: `art_pipeline_jobs` now returns `art_path`. The workflow has
  no service-role key, so it calls the **`submission-art` Edge Function**
  (deployed, `verify_jwt` off, authenticated by `ART_PIPELINE_TOKEN`):
  `sign` returns 10-minute signed URLs for exactly the paths
  `submission_art_sign_jobs(token)` lists (approved, art pending), which the
  script downloads, converts and publishes to Cloudflare as before.
- **Removal**: a trigger marks an upload removable when its art is
  published, or **30 days** after the submission is denied or withdrawn;
  uploads never attached to a submission are removable after 2 days. Every
  workflow run makes one `cleanup` call to the same Edge Function, which
  deletes `submission_art_cleanup_jobs(token)` through the Storage API and
  records it with `submission_art_mark_removed`.
  _Why the Edge Function and not a pending SQL file:_ Storage blocks plain
  SQL `DELETE` on `storage.objects` (its `protect_delete` trigger), so a SQL
  file could not remove the bytes anyway, and this way no migration contains
  a DELETE. The rows' `art_path` is kept as history; `art_removed_at` says
  the bytes are gone.
- The cleanup only runs when the workflow runs (it needs `ART_PIPELINE_TOKEN`
  set); until then removable uploads simply stay in the private bucket.

Pending (not applied, needs a DROP):
`20261012000092_pending_showcase_cleanup.sql` — fixes the `Item` CHECK bug and
retires `get_card_submissions` v1.

## Part 3 — Card editor

Two places: the review card's **FULL EDITOR (MANUAL)** button (approving a
submission) and the **CARD EDITOR** tab (any live card). Logic:
`src/meta/cardEditor.ts`; form: `src/meta/CardEditorPanel.tsx`.

- **Identity**: name, flavour, rarity, set, type (and id, before minting).
- **Game data**, per field with a **keep rolled** box: colours, tier, effect +
  N, modifiers, subtype (Item/Event), Leader abilities (spend −1…−5 / build
  +1…+3 nerve, keyword, N), Location rule + parameter, rules text.
- **MANUAL** skips the roll entirely: every field is filled from the current
  card and must stay set; the override object carries `manual: true`.
- **RESET TO ROLLED** removes the overrides.
- **Validation** (`validateEdit`) runs on the card as it will print: tier 1–5,
  subtype per type, colour gating (`keywordAllowed`), effect vs modifier kind,
  the engine's per-type bans (Snuff, Straddle), keyword number units, Leader
  colour count and nerve ranges, Location parameters from `LOCATION_TEMPLATES`.
  Save is disabled while anything fails. The preview is `CardFaceV4` with its
  rules text.
- **Rarity, type or id changes re-roll the hash** (`id|type|rarity`): every
  field left on "keep rolled" changes. The editor warns, and for bundled cards
  reminds you to run `npm run fetch:cards` (verify:pool compares the bundle's
  rarity).
- **Writes**: `creator_update_card(p_card)` (migration
  `20261012000005_creator_card_editor.sql`, applied live): Creator role checked
  server-side, existing cards only, goes through `apply_card_upsert` so the
  template overrides and the mechanics columns are written together. It returns
  the new `get_catalog_version()`, which the template change has already moved.

### Engine support (`src/game/poker/cardpool.ts`)

`deriveCardMechanics` honours every key the editor saves: `tier`, `effect`,
`mods`, `subtype`, `text`, and `colors`, `abilities`, `rule`
(all typed on `CardOverrides` in `src/types.ts`).

- `colors` is printed as-is. The roll (a power's effect and mods, a Leader's
  generated abilities) still uses the generated colours, so a colour-only
  edit does not re-roll anything — the same card the editor previews.
- `abilities` replaces both Leader abilities via `abilityFromOverride`
  (spend at tier 4, build at tier 2, `buildCost` on a build that is not a
  Straddle); `text` is rebuilt from them unless `text` is set.
- `rule` replaces the Location's rolled rule; `text` follows it.

Deleting an override restores the rolled card exactly, and a card without
overrides derives exactly as before (`cardpool.test.ts`).
`applyExtendedOverrides` now only re-applies values the engine already set.

## Tests

- `supabase/showcase-art-pipeline.test.ts` — approve queues, token gating,
  jobs/report, retry, replay protection (PGlite).
- `supabase/creator-card-editor.test.ts` — `creator_update_card` over the real
  `apply_card_upsert`: role check, overrides + columns, reset, version bump.
- `src/meta/cardEditor.test.ts` — override application, MANUAL seeding,
  validation.
- `scripts/lib/showcase.test.ts` — key naming, URL handling, job parsing.
- `supabase/submission-art-uploads.test.ts` — bucket limits, own-folder and
  3-pending-upload RLS, Creator-only reads, `submit_card_art`, token-gated
  sign/cleanup lists, removal schedule (PGlite).
- `src/meta/submissionUpload.test.ts` — client file checks and 5:7 hint.
