/**
 * Deck Import/Export Utilities
 * Format: base64(JSON array of card UUIDs)
 * Prefix: "FRY:" to identify deck codes
 */

const PREFIX = 'FRY:';

export function encodeDeckCode(cardIds: string[]): string {
  const json = JSON.stringify(cardIds);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `${PREFIX}${b64}`;
}

export function decodeDeckCode(code: string): string[] | null {
  try {
    const stripped = code.trim().startsWith(PREFIX) ? code.trim().slice(PREFIX.length) : code.trim();
    const json = decodeURIComponent(escape(atob(stripped)));
    const ids = JSON.parse(json);
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) return null;
    return ids;
  } catch {
    return null;
  }
}

export function isDeckCode(value: string): boolean {
  return value.trim().startsWith(PREFIX) || (value.trim().length > 20 && /^[A-Za-z0-9+/=]+$/.test(value.trim()));
}