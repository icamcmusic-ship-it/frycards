# The card art pipeline

The runbook for `scripts/migrate-art.ts`. Read this before running any
phase — the last one deletes the only copies of the masters that exist on a
server.

## Why

Cached egress is billed on every byte the Supabase CDN serves, and the
`Card Images` bucket is ~1 GB of raw generator output: 153 PNGs averaging
5.9 MB (largest 11 MB), 140 webp masters at ~740 kB, 8 mp4 full-arts at ~5.5 MB.
A card face renders into a box at most 240 CSS pixels wide, so essentially all
of that is waste.

The on-demand fix — Supabase's image transformation endpoint — needs a paid
add-on **that is not enabled on this project**. While it is off, a request for
a derivative fails and the app falls back to the full-resolution original, so
the rewrite cost a round trip per image and saved nothing.

Generating the derivatives once, ahead of time, removes the add-on from the
picture entirely: a card face costs ~30-70 kB instead of ~6 MB, whoever serves
it.

**The resizing and the hosting are separate decisions**, and there are two
different problems here:

- **Egress** — bytes served per view. Fixed by serving small derivatives
  instead of originals. Needs no new vendor.
- **Storage** — bytes held, billed whether or not anyone looks at them. Fixed
  only by making the stored files smaller. The free tier caps this at 1 GB and
  the bucket is already at ~1.02 GB, so this one is a live ceiling, not a
  future concern.

Deriving a ladder fixes the first and slightly worsens the second (derivatives
sit alongside the originals). `shrink-originals` is what fixes the second, and
`add` is what stops new art re-creating it. Moving hosts is a third, separate
option that takes the art off Supabase's quota entirely — not required for
either fix.

## What you need first

- The Supabase service-role key (listing and deleting objects is not something
  the publishable key may do).
- ~2 GB of free disk for the archive and the generated derivatives.
- Somewhere off-platform for the full-resolution masters. They are not needed
  to run the game and should not be paid for on the storage line; they matter
  only if you may ever reprint, re-crop, or re-derive at a larger size.
- Only if you are moving hosts: an S3-compatible bucket with public read, and
  an API key for it. `upload` talks plain S3, so the endpoint is what picks the
  host — Backblaze B2, Wasabi, R2, or Supabase's own S3 endpoint all work.
- ffmpeg, if you also want to run `npm run media:shrink-video` — separate from
  this pipeline and safe to do either before or after.

```
export SUPABASE_SERVICE_ROLE_KEY=...
export VITE_ART_BASE_URL=https://art.frycards.example   # no trailing slash

# only when moving hosts
export ART_S3_ENDPOINT=https://s3.us-west-000.backblazeb2.com
export ART_S3_ACCESS_KEY_ID=...
export ART_S3_SECRET_ACCESS_KEY=...
export ART_S3_BUCKET=frycards-art
```

## Staying on Supabase: the short version

The full sequence for "keep Supabase, get both numbers down", assuming the
full-resolution masters are already safe on your own disk:

```
npm run media:migrate archive            # 1. pull the bucket down (~1 GB, once)
npm run media:migrate derive             # 2. build the ladder locally
npm run media:migrate upload -- --derivatives-only   # 3. push the ladder up
npm run media:shrink-originals -- --yes             # 4. shrink the stored originals
npm run media:shrink-video               # 6. re-encode the 8 mp4s
```

Step 5 (`rewrite`) is **not needed** on this path: `shrink-originals` replaces
each object under its existing key, so the catalog already points at the right
place. Set `VITE_ART_BASE_URL` to the bucket's public base in the deploy
environment and the app starts using the ladder. `purge` is not used either —
there is no second host to move off.

From then on, new art goes in with `npm run media:add` rather than through the
dashboard. Details for every phase below.

## The phases

Run them in order. Each is resumable — re-running a phase skips work that is
already done — and each can be inspected before moving on.

### 1. `npm run media:migrate archive`

Downloads every object to `./art-archive/`, preserving the key as the path,
and writes `manifest.json`. This is the one phase that costs egress: about
1 GB, once. It refuses to continue if any object failed to download, because
every later phase reads the manifest.

**This archive is your backup.** Once phase 5 runs it holds the only lossless
copies of the PNG masters. Put it somewhere durable — it is gitignored, and it
is not in the repo for a reason.

### 2. `npm run media:migrate derive`

Generates a webp at every ladder width (160/240/320/480/640/960) for each
still, at quality 62. Nothing is uploaded and nothing is downloaded; it reads
the archive. Roughly 1,700 files, ~150 MB.

A rung wider than its source is generated at the source's own width rather
than upscaled — but it is still generated, because the app picks a rung from
the ladder without knowing any source's dimensions, and a missing object is a
404 into the full-size fallback.

Spot-check a few before continuing:

```
open art-archive/.derived/derived/320/
```

### 3. `npm run media:migrate upload`

**Order matters, and `--derivatives-only` is not optional on the stay-put
path.** The archived original is the full-size master, so a plain `upload`
against a bucket that has already been shrunk restores every multi-megabyte
file — undoing step 4 entirely. Either pass `--derivatives-only`, or upload
before shrinking, or both. The sequence above does both.

Staying on Supabase? Point `ART_S3_ENDPOINT` at Supabase's own S3 API
(`https://<project>.supabase.co/storage/v1/s3`, with an S3 access key pair from
the storage settings page) and `ART_S3_BUCKET` at `Card Images`. The
derivatives then land in the same bucket the catalog already uses.

Pushes the originals and every derivative to the configured bucket. Originals get 30-day
cache-control (matching what the `20260907000000` migration set); derivatives
get a year and `immutable`, because a derived key is a pure function of its
source key and a width, and the source keys carry generation UUIDs.

Verify the bucket is actually public before continuing — fetch one derivative
in a browser.

### 4. `npm run media:shrink-originals -- --yes`

**This is the phase that reduces storage.** Everything above only adds files.

Replaces each stored original with a display master — at most 1200px wide,
webp — under the **same key**. A 4K generator PNG becomes something in the low
hundreds of kilobytes, and the bucket stops paying every month for pixels
nothing has ever requested: `WIDTH_LADDER` tops out at 960, so anything wider
than that has never been served to a single player.

Same key is the point. The catalog keeps pointing where it points, so there is
no rewrite, no `sync-cards-db`, no redeploy — and the fallback path in
`SafeImage`/`CardArt` keeps resolving, just cheaply. One cosmetic consequence:
a key ending `.png` now holds webp bytes. That is fine — the `Content-Type`
header is what browsers honour and it is set correctly — but it will look odd
in the dashboard.

It refuses to touch an object unless a byte-identical archive copy exists on
disk, exactly as `purge` does, because the replacement is lossy and the bucket
cannot undo it. It also refuses to run without `--yes`.

### 5. `npm run media:migrate rewrite`

Rewrites the Supabase base URL to `VITE_ART_BASE_URL` across
`src/game/generated-cards.ts`. Then sync the live catalog the usual way:

```
npx tsx scripts/sync-cards-db.ts > cards-sync.sql
# apply cards-sync.sql
```

**Skip this phase entirely if you are staying on Supabase** — `shrink-originals`
replaced each object under its existing key, so the catalog is already correct.

**Set `VITE_ART_BASE_URL` in the deploy environment either way.** The app reads
it to find the derivatives; without it every URL resolves to the stored master —
correct, just larger than it needs to be. Staying put means pointing it at the
Supabase bucket's own public base.

Deploy and confirm art loads from the new base in production before phase 5.

### 6. `npm run media:migrate purge`

**Only when you have moved hosts.** Deletes the Supabase copies. It refuses to delete anything unless all three
hold:

- the catalog no longer contains a Supabase storage URL,
- every object has an archive copy on disk,
- every archive copy matches the reported size byte-for-byte.

If any object fails verification, nothing is deleted at all.

## Adding art: `npm run media:add`

```
npm run media:add -- "Volume 2" ~/art/new-card.png ~/art/another.png
```

The first argument is the bucket folder, the rest are local files. Each one is
resized to the display master, uploaded, derived, and its ladder uploaded; the
catalog URL to paste into `generated-cards.ts` is printed for each.

**Use this instead of the dashboard.** A raw generator PNG dropped into the
bucket by hand is 6-11 MB on the storage line permanently, and enough of them
walks the bucket straight back to the cap that `shrink-originals` just pulled
it away from. Going through `add` keeps each new card in the low hundreds of
kilobytes, master and full ladder together.

The archive receives the **resized** master, not the file you passed — the
archive's contract is "a byte-identical copy of what is in the bucket", which
is what lets `shrink-originals` and `purge` verify against it. Your
full-resolution original stays wherever you keep it, which should not be here.

## Keeping up: `npm run media:sync`

The migration is not a one-off. The app has **no binary upload path** — every
image in the product is a URL somebody pasted into a form — so new art reaches
the bucket only when someone puts it there through the Supabase dashboard. Until
it is derived, that object is served full size, from the metered host, forever.

`npm run media:sync` is the catch-up for anything that got in another way:
it archives, derives and (if a bucket is configured) uploads whatever is new or
changed, then updates the manifest. It is additive — it never deletes and never
rewrites the catalog — and an original replaced in place has its stale
derivatives dropped and regenerated.

`add` is the front door; `sync` is the safety net for art that came in through
the dashboard anyway. Run it after any such drop.

## The other way art gets back onto the metered host

A player or creator can paste a link to the project's own storage into the card
submission form, the bulk import, or a shop banner — it looks like any other
https link, and nothing downstream resizes it. `isMeteredStorageUrl()` in
`src/lib/media.ts` is what catches that, and all four entry points check it.
The rejection names the fix rather than just refusing, because "not allowed"
with no alternative just gets pasted somewhere else.

Note this is stricter than the server: `submit_card` accepts any https URL.
The guard is a client-side and API-wrapper rule, so it is a cost control, not a
security boundary.

## Rolling back

Unset `VITE_ART_BASE_URL` and redeploy: the app goes back to requesting stored
masters directly, and every URL still resolves. To undo `shrink-originals`,
re-upload the affected keys from `./art-archive/` — which is the one and only
reason that directory has to outlive the migration.

## What this does not cover

- **Video.** The ladder is a still-image concept. `npm run media:shrink-video`
  re-encodes the 8 mp4 full-arts (~43 MB → ~4 MB) and is independent of this
  migration; run it against whichever host the art lives on at the time.
- **Off-site art.** Card submissions point at wherever the submitter's link
  points — usually `cdn.midjourney.com`. Those cost this project no egress at
  all, which is why they are allowed, but they are also outside every guarantee
  here: nothing derives them, and nothing stops them rotting when the host
  expires the link.
