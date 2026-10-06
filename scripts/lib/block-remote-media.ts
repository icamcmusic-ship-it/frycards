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
  if (process.env.ART_IN_HARNESS) return;
  await ctx.route('**/*', (route) => {
    const req = route.request();
    const type = req.resourceType();
    const url = req.url();
    const local = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:)/.test(url);
    if (!local && (type === 'image' || type === 'media')) return route.abort();
    return route.continue();
  });
}
