import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { POOL_BY_ID } from '../game/poker/cardpool';
import { isPower, tierLabel } from '../game/poker/cards';
import { cardColors } from '../game/poker/colors';
import { MODES } from '../game/poker/constants';
import { checkDeck } from '../game/poker/deck';
import { ruleName } from '../game/poker/locations';
import { useEscapeClose, useFocusTrap } from '../components/useFocusTrap';
import { PopButton } from './ui';
import { decodeDeckCode, RETIRED_CODE_ERROR } from './deckcode';

/**
 * A read-only look at a deck opened from a shared link (`?deck=FRY2:…`): the
 * Leader and its colours, the format, the Location, the powers by tier, and
 * whether the list is legal in its format. Old `FRY1:` links from the retired
 * card game decode to an explanation instead. Works signed out and as a
 * guest. Signed-in players can carry it into the Deck Builder as an unsaved
 * draft; nothing is saved or bought from here.
 */
export function DeckLinkPreview({
  code,
  canOpenBuilder,
  onOpenBuilder,
  onClose,
}: {
  code: string;
  canOpenBuilder: boolean;
  onOpenBuilder: () => void;
  onClose: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>();
  useEscapeClose(onClose);
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    const res = decodeDeckCode(code, new Map(Object.entries(POOL_BY_ID)));
    if ('error' in res) return { error: res.error } as const;
    const counts = new Map<string, number>();
    for (const id of res.cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const all = [...counts.entries()].map(([id, n]) => ({ def: POOL_BY_ID[id], n }));
    const locations = all.filter((r) => r.def.type === 'Location');
    const rows = all
      .filter((r) => isPower(r.def))
      .sort(
        (a, b) => (a.def.tier ?? 0) - (b.def.tier ?? 0) || a.def.name.localeCompare(b.def.name),
      );
    const powers = rows.reduce((s, r) => s + r.n, 0);
    const check = checkDeck(res.leaderId, res.cardIds, res.mode);
    return {
      leader: POOL_BY_ID[res.leaderId],
      mode: MODES[res.mode],
      locations,
      rows,
      powers,
      issues: check.issues,
    } as const;
  }, [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* clipboard blocked: the code is still readable in the address bar */
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-[var(--c-ink)]/85 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shared deck"
        tabIndex={-1}
        className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black w-full max-w-md max-h-[90vh] flex flex-col"
      >
        <div className="px-4 py-2.5 bg-[var(--c-ink)] flex items-center justify-between">
          <h2 className="heading-font text-sm text-[var(--c-yellow)]">SHARED DECK</h2>
          <PopButton color="yellow" onClick={onClose} ariaLabel="Close shared deck">
            ✕
          </PopButton>
        </div>
        <div className="p-4 overflow-y-auto">
          {'error' in parsed ? (
            <p className="text-sm font-bold text-[var(--c-red)]">
              {parsed.error === RETIRED_CODE_ERROR
                ? parsed.error
                : `This deck link can't be opened: ${parsed.error}`}
            </p>
          ) : (
            <>
              <div className="heading-font text-base leading-tight">{parsed.leader.name}</div>
              <div className="text-[11px] font-bold text-[var(--c-steel)] mb-1">
                Leader · {cardColors(parsed.leader).join(' / ') || 'Colourless'} ·{' '}
                {parsed.mode.label} · {parsed.powers}/{parsed.mode.powers} powers
              </div>
              <div
                className={
                  parsed.issues.length
                    ? 'text-[11px] font-bold text-[var(--c-red)] mb-3'
                    : 'text-[11px] font-bold text-[var(--c-steel)] mb-3'
                }
              >
                {parsed.issues.length === 0
                  ? `✓ Legal in ${parsed.mode.label}`
                  : `⚠ Not legal in ${parsed.mode.label} yet: ${parsed.issues[0].message}${parsed.issues.length > 1 ? ` (+${parsed.issues.length - 1} more)` : ''}`}
              </div>
              <ul className="flex flex-col gap-1 mb-4">
                {parsed.locations.map(({ def }) => (
                  <li
                    key={def.id}
                    className="flex items-center justify-between gap-2 text-xs font-bold ink-border-sm px-2 py-1 bg-[var(--c-ink)] text-[var(--c-paper)]"
                  >
                    <span className="truncate">{def.name}</span>
                    <span className="text-[10px] shrink-0 opacity-80">
                      Location{def.rule ? ` · ${ruleName(def.rule)}` : ''}
                    </span>
                  </li>
                ))}
                {parsed.rows.map(({ def, n }) => (
                  <li
                    key={def.id}
                    className="flex items-center justify-between gap-2 text-xs font-bold ink-border-sm px-2 py-1"
                  >
                    <span className="truncate">
                      {n > 1 ? `${n}× ` : ''}
                      {def.name}
                    </span>
                    <span className="text-[10px] text-[var(--c-steel)] shrink-0">
                      {def.type} · {tierLabel(def)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {!('error' in parsed) && canOpenBuilder && (
              <PopButton color="red" onClick={onOpenBuilder}>
                OPEN IN DECK BUILDER
              </PopButton>
            )}
            {!('error' in parsed) && (
              <PopButton color="yellow" onClick={copy}>
                {copied ? 'COPIED!' : 'COPY CODE'}
              </PopButton>
            )}
            <PopButton color="black" onClick={onClose}>
              CLOSE
            </PopButton>
          </div>
          {!('error' in parsed) && !canOpenBuilder && (
            <p className="text-[10px] font-bold text-[var(--c-steel)] mt-3">
              Sign in to open this deck in your Deck Builder.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
