# Moving the card art to Cloudflare R2

The runbook for `scripts/migrate-art-to-r2.ts`. Read this before running any
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

R2 charges nothing for egress. Generating the derivatives once, ahead of time,
removes the add-on from the picture entirely. After this runs, Supabase serves
no art at all and its cached egress goes to roughly zero.

## What you need first

- An R2 bucket (default name `frycards-art`) with public access, either via an
  `r2.dev` URL or a custom domain in front of it.
- An R2 API token with object read/write on that bucket.
- The Supabase service-role key (listing and deleting objects is not something
  the publishable key may do).
- ffmpeg, if you also want to run `npm run media:shrink-video` — separate from
  this migration and safe to do either before or after.
- ~2 GB of free disk for the archive and the generated derivatives.

```
export SUPABASE_SERVICE_ROLE_KEY=...
export R2_ACCOUNT_ID=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
export R2_BUCKET=frycards-art
export VITE_ART_BASE_URL=https://art.frycards.example   # no trailing slash
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

Pushes the originals and every derivative to R2. Originals get 30-day
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
correct, just expensive.

Deploy and confirm art loads from R2 in production before phase 5.

### 5. `npm run media:migrate purge`

Deletes the Supabase copies. It refuses to delete anything unless all three
hold:

- the catalog no longer contains a Supabase storage URL,
- every object has an archive copy on disk,
- every archive copy matches the reported size byte-for-byte.

If any object fails verification, nothing is deleted at all.

## Rolling back

Before phase 5, rollback is free: revert the catalog commit, unset
`VITE_ART_BASE_URL`, redeploy. After phase 5, re-upload from `./art-archive/`.

## What this does not cover

- **Video.** The ladder is a still-image concept. `npm run media:shrink-video`
  re-encodes the 8 mp4 full-arts (~43 MB → ~4 MB) and is independent of this
  migration; run it against whichever host the art lives on at the time.
- **Uploads made after the migration.** Anything written to the Supabase bucket
  later (a new card, a shop banner) needs the same treatment, or it is a
  full-size original being served from the expensive host again. If art uploads
  become routine, this belongs in the upload path rather than in a script.
