/**
 * CSV export, kept dependency-free. Cells that a spreadsheet would run as a
 * formula (starting with `=`, `+`, `-` or `@`) get a leading apostrophe, so a
 * hostile card name cannot execute when the file is opened.
 */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export interface CollectionCsvRow {
  id: string;
  name: string;
  type: string;
  rarity: string;
  set: string;
  quantity: number;
  foil: number;
  serialized: number;
}

const HEADER = ['id', 'name', 'type', 'rarity', 'set', 'quantity', 'foil', 'serialized'];

/** One line per owned card, header first. `quantity` is the normal (non-foil)
 * copies, serialized prints listed separately. */
export function collectionCsv(rows: CollectionCsvRow[]): string {
  return toCsv([
    HEADER,
    ...rows.map((r) => [r.id, r.name, r.type, r.rarity, r.set, r.quantity, r.foil, r.serialized]),
  ]);
}

/** Save `text` as a file through a temporary link. */
export function downloadText(
  filename: string,
  text: string,
  mime = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
