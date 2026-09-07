/** Per-image ceiling — a stalled request (network hiccup, CDN throttling
 * under a large batch) must never hang the whole gate forever. */
const PER_IMAGE_TIMEOUT_MS = 12_000;
/** Cap how many images load at once — firing hundreds of simultaneous
 * requests at the storage CDN is what causes some of them to stall in the
 * first place, so this is as much about avoiding the timeout above as
 * recovering from it. */
const CONCURRENCY = 24;

import { isVideoSrc, mediaUrl } from './media';

function loadOne(url: string): Promise<void> {
  // A video URL fed to `new Image()` fails to decode immediately — the
  // browser fires onerror right away, so it was counting as "loaded" without
  // ever issuing a real network request. Every Full-Art/Mythic card's art was
  // therefore never actually preloaded and still stalled/popped in the first
  // time it rendered in game. Preload it the way CardArt actually plays it:
  // through a <video> element buffering its data.
  if (isVideoSrc(url)) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        video.oncanplaythrough = null;
        video.onerror = null;
        video.src = '';
        video.load();
        resolve();
      };
      const timer = window.setTimeout(settle, PER_IMAGE_TIMEOUT_MS);
      video.oncanplaythrough = settle;
      video.onerror = settle;
      video.src = url;
      video.load();
    });
  }
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      // On a timeout the underlying network request/decode was still in
      // flight — detach the handlers and clear src so the browser can
      // cancel/GC it instead of it lingering in the background competing
      // for bandwidth with whatever loads next.
      img.onload = null;
      img.onerror = null;
      img.removeAttribute('src');
      resolve();
    };
    const timer = window.setTimeout(settle, PER_IMAGE_TIMEOUT_MS);
    img.onload = settle;
    img.onerror = settle;
    img.src = url;
  });
}

/**
 * Preload a batch of images so the user never watches them pop in one at a
 * time while browsing. Never rejects — a broken/404 URL, or one that simply
 * never finishes loading, just counts as "done" after a timeout (the
 * component that renders it falls back gracefully; see SafeImage / CardArt),
 * so no single asset can block the whole gate indefinitely. Loads at most
 * CONCURRENCY images at once rather than firing the whole batch in parallel.
 */
export function preloadImages(
  urls: (string | null | undefined)[],
  onProgress?: (loaded: number, total: number) => void,
  /** Warm the resized derivative for a box this wide rather than the
   * full-resolution original — preloading originals is how a single screen
   * transition turns into hundreds of megabytes of egress. Defaults to the
   * largest card tier. */
  boxWidth = 240,
): Promise<void> {
  const unique = [
    ...new Set(urls.map((u) => mediaUrl(u, boxWidth)).filter((u): u is string => !!u)),
  ];
  const total = unique.length;
  if (total === 0) {
    onProgress?.(0, 0);
    return Promise.resolve();
  }
  let loaded = 0;
  let next = 0;
  return new Promise((resolve) => {
    const startNext = (): void => {
      if (next >= total) return;
      const url = unique[next++];
      loadOne(url).then(() => {
        loaded++;
        onProgress?.(loaded, total);
        if (loaded >= total) resolve();
        else startNext();
      });
    };
    for (let i = 0; i < Math.min(CONCURRENCY, total); i++) startNext();
  });
}
