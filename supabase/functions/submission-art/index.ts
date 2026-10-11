// submission-art: Storage operations for the showcase-art workflow
// (scripts/publish-showcase-art.ts). The workflow has no service-role key; it
// sends the ART_PIPELINE_TOKEN, and every path this function touches comes
// from a token-checked RPC (migration 20261013000002), never from the caller:
//
//   { action: 'sign',    token } -> { urls: { [path]: signedUrl } }  (10 min)
//   { action: 'cleanup', token } -> { removed: string[] }
//
// cleanup deletes through the Storage API (plain SQL deletes on
// storage.objects are blocked by Storage) and records the removal with
// submission_art_mark_removed. Deployed with verify_jwt off: the token is the
// authentication.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const BUCKET = 'submission-art';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: { action?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const token = typeof body.token === 'string' ? body.token : '';
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  if (body.action === 'sign') {
    const { data, error } = await admin.rpc('submission_art_sign_jobs', { p_token: token });
    if (error) return json({ error: error.message }, 403);
    const paths = (data as string[]) ?? [];
    if (paths.length === 0) return json({ urls: {} });
    const signed = await admin.storage.from(BUCKET).createSignedUrls(paths, 600);
    if (signed.error) return json({ error: signed.error.message }, 500);
    const urls: Record<string, string> = {};
    for (const s of signed.data ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
    return json({ urls });
  }

  if (body.action === 'cleanup') {
    const { data, error } = await admin.rpc('submission_art_cleanup_jobs', { p_token: token });
    if (error) return json({ error: error.message }, 403);
    const paths = (data as string[]) ?? [];
    if (paths.length === 0) return json({ removed: [] });
    const rm = await admin.storage.from(BUCKET).remove(paths);
    if (rm.error) return json({ error: rm.error.message }, 500);
    // remove() is idempotent for objects that are already gone, so every
    // listed path is now absent.
    const mark = await admin.rpc('submission_art_mark_removed', { p_token: token, p_paths: paths });
    if (mark.error) return json({ error: mark.error.message }, 500);
    return json({ removed: paths });
  }

  return json({ error: 'unknown action' }, 400);
});
