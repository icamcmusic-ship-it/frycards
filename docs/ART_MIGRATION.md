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

**The resizing and the hosting are separate decisions.** Deriving alone is a
~50-100x cut and needs no new vendor — phases 1, 2 and 4 with the destination
left as Supabase. Moving hosts takes the art off the egress quota entirely.
Start with the first; the second is there when you want it.

## What you need first

- The Supabase service-role key (listing and deleting objects is not something
  the publishable key may do).
- ~2 GB of free disk for the archive and the generated derivatives.
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

**Skip this if you are staying on Supabase** — upload the contents of
`art-archive/.derived/derived/` into the bucket through the dashboard or the
Supabase S3 endpoint instead, keeping the paths exactly as they are on disk.

Pushes the originals and every derivative to the configured bucket. Originals get 30-day
cache-control (matching what the `20260907000000` migration set); derivatives
get a year and `immutable`, because a derived key is a pure function of its
source key and a width, and the source keys carry generation UUIDs.

Verify the bucket is actually public before continuing — fetch one derivative
in a browser.

### 4. `npm run media:migrate rewrite`

Rewrites the Supabase base URL to `VITE_ART_BASE_URL` across
`src/game/generated-cards.ts`. Then sync the live catalog the usual way:

```
npx tsx scripts/sync-cards-db.ts > cards-sync.sql
# apply cards-sync.sql
```

**Set `VITE_ART_BASE_URL` in the deploy environment too.** The app reads it to
find the derivatives; without it every URL resolves to the full-size original —
correct, just expensive. Staying on Supabase? Point it at the Supabase bucket's
own public base: the derivatives live there, and the ladder works the same.

Deploy and confirm art loads from the new base in production before phase 5.

### 5. `npm run media:migrate purge`

**Only when you have moved hosts.** Deletes the Supabase copies. It refuses to delete anything unless all three
hold:

- the catalog no longer contains a Supabase storage URL,
- every object has an archive copy on disk,
- every archive copy matches the reported size byte-for-byte.

If any object fails verification, nothing is deleted at all.

## Keeping up: `npm run media:sync`

The migration is not a one-off. The app has **no binary upload path** — every
image in the product is a URL somebody pasted into a form — so new art reaches
the bucket only when someone puts it there through the Supabase dashboard. Until
it is derived, that object is served full size, from the metered host, forever.

`npm run media:sync` archives, derives and (if a bucket is configured) uploads
anything new or changed, then updates the manifest. It is additive: it never
deletes and never rewrites the catalog, because the archive is the backup and
`purge` is the only phase allowed to be destructive. An original that was
replaced in place has its stale derivatives dropped and regenerated.

Run it after any art drop. If art drops become routine, put it on a schedule.

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

Before phase 5, rollback is free: revert the catalog commit, unset
`VITE_ART_BASE_URL`, redeploy. After phase 5, re-upload from `./art-archive/`.

## What this does not cover

- **Video.** The ladder is a still-image concept. `npm run media:shrink-video`
  re-encodes the 8 mp4 full-arts (~43 MB → ~4 MB) and is independent of this
  migration; run it against whichever host the art lives on at the time.
- **Off-site art.** Card submissions point at wherever the submitter's link
  points — usually `cdn.midjourney.com`. Those cost this project no egress at
  all, which is why they are allowed, but they are also outside every guarantee
  here: nothing derives them, and nothing stops them rotting when the host
  expires the link.
