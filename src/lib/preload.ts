/**
 * Preload a batch of images so the user never watches them pop in one at a
 * time while browsing. Never rejects — a broken/404 URL just counts as
 * "done" (the component that renders it falls back gracefully; see
 * SafeImage / CardArt), so one bad asset can't hang the whole gate forever.
 */
export function preloadImages(
  urls: (string | null | undefined)[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const unique = [...new Set(urls.filter((u): u is string => !!u))];
  const total = unique.length;
  if (total === 0) {
    onProgress?.(0, 0);
    return Promise.resolve();
  }
  let loaded = 0;
  return new Promise((resolve) => {
    const done = () => {
      loaded++;
      onProgress?.(loaded, total);
      if (loaded >= total) resolve();
    };
    for (const url of unique) {
      const img = new Image();
      img.onload = done;
      img.onerror = done;
      img.src = url;
    }
  });
}
