-- Cached egress: stop re-serving card art every hour.
--
-- Every object in the project was uploaded with the storage default of
-- `cache-control: max-age=3600`. The `Card Images` bucket is ~1 GB of
-- generator output (149 PNGs averaging ~6 MB, plus webp masters and mp4
-- full-arts), so a returning player re-downloaded the art of every card they
-- looked at once an hour, and each of those re-downloads was billed as cached
-- egress off the storage CDN.
--
-- Storage serves the `cache-control` response header straight from the
-- object's `metadata.cacheControl`, so widening it here retires that repeat
-- traffic: the browser answers from its own cache and never reaches the CDN
-- at all.
--
-- 30 days rather than a year on purpose. The art is effectively immutable
-- (filenames carry generation UUIDs, and the named full-arts are only ever
-- added to), but a file that does get replaced in place should self-heal for
-- everyone within a month instead of being pinned in browser caches until
-- 2027. To force an earlier refresh, append a `?v=` query parameter to the
-- URL in the catalog.

update storage.objects
set metadata = jsonb_set(metadata, '{cacheControl}', '"max-age=2592000"')
where metadata ? 'cacheControl'
  and metadata->>'cacheControl' is distinct from 'max-age=2592000';
