import type { BrowserContext } from 'playwright';

/**
 * Abort image and video requests that leave the local dev server.
 *
 * CI drives every screen in a headless browser, and each run used to download
 * the full card art from the art host: about 368 GB of Supabase egress in one
 * day of checks, and a harness job that took half an hour. Nothing the audits
 * assert depends on the pixels, and both already ignore the resulting "Failed
 * to load resource" console errors, so the art is simply not fetched.
 *
 * Set ART_IN_HARNESS=1 to load it for real, e.g. when debugging a card face.
 */
export async function blockRemoteMedia(ctx: BrowserContext): Promise<void> {
  await blockSupabase(ctx);
  if (process.env.ART_IN_HARNESS) return;
  await ctx.route('**/*', (route) => {
    const req = route.request();
    const type = req.resourceType();
    const url = req.url();
    const local = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:)/.test(url);
    if (!local && (type === 'image' || type === 'media')) return route.abort();
    // fallback(), not continue(): the newest route runs first, and continue()
    // would send a Supabase request to the network past blockSupabase.
    return route.fallback();
  });
}

/** The live project. Matches REST, RPC, Auth, Storage and Realtime hosts. */
const SUPABASE_HOST = /^(https?|wss?):\/\/[a-z0-9-]+\.supabase\.(co|in)\//;

/**
 * Refuse every connection from a harness browser to the live Supabase project.
 *
 * The preview pages answer PostgREST reads from fixtures by patching `fetch`
 * (src/preview-fixtures.ts), but two things went straight past that to
 * production: Realtime WEBSOCKETS (every screen that subscribes to a table
 * opened one — 422 of 425 Realtime connections in a 2026-10-07 log sample
 * were HeadlessChrome) and the Discord sign-in redirect the click-through
 * presses. Neither is something a layout or rules audit can assert on, and
 * both are billed egress on the real project. A refused socket is just a
 * channel that never gets an event, which every screen already handles.
 *
 * Set SUPABASE_IN_HARNESS=1 to let them through, e.g. when debugging a live
 * subscription.
 */
export async function blockSupabase(ctx: BrowserContext): Promise<void> {
  if (process.env.SUPABASE_IN_HARNESS) return;
  await ctx.routeWebSocket(SUPABASE_HOST, (ws) => ws.close());
  await ctx.route(SUPABASE_HOST, (route) => route.abort());
}
