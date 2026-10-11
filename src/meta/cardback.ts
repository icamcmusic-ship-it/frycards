import { bundledCardBack } from './cardBackAssets';

// The equipped card-back art, applied to all face-down cards in a match.
// Set from profile data before a game mounts; null = default comic back.
let currentCardBack: string | null = null;

export function setCardBackImage(url: string | null) {
  currentCardBack = url;
  // A repo card back whose Cloudflare copy is not deployed yet falls back to
  // the copy shipped with the app (see cardBackAssets.ts). Probe once here so
  // face-down cards never paint a 404.
  const bundled = bundledCardBack(url);
  if (!url || !bundled || typeof Image === 'undefined') return;
  const probe = new Image();
  probe.onerror = () => {
    if (currentCardBack === url) currentCardBack = bundled;
  };
  probe.src = url;
}

export function getCardBackImage(): string | null {
  return currentCardBack;
}
