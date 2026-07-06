// The equipped card-back art, applied to all face-down cards in a match.
// Set from profile data before a game mounts; null = default comic back.
let currentCardBack: string | null = null;

export function setCardBackImage(url: string | null) {
  currentCardBack = url;
}

export function getCardBackImage(): string | null {
  return currentCardBack;
}
