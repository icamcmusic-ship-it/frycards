import React, { useMemo, useState } from 'react';
import { POOL } from '../game/poker/cardpool';
import { CardFace } from '../components/CardFaceV4';
import { Card3DInspector } from '../components/Card3DInspector';
import { cardOfTheDay, setBuildWith } from './cardOfTheDay';

/**
 * A spotlight on one catalog card per day, on the main menu. Tap it to look
 * it over in the inspector. It works for guests, costs no requests, and shows
 * every card whether or not the player owns it, so it doubles as a way to
 * learn the card pool.
 */
export function CardOfTheDay({ onBuild }: { onBuild?: () => void } = {}) {
  const card = useMemo(() => cardOfTheDay(POOL), []);
  const [open, setOpen] = useState(false);
  if (!card) return null;
  return (
    <>
      <div className="relative z-10 max-w-5xl mx-auto px-6 pb-6 flex justify-center">
        <div className="flex items-center gap-4 bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3">
          <CardFace def={card} size="compact" onClick={() => setOpen(true)} />
          <div className="max-w-[16rem]">
            <div className="heading-font text-[11px] bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5 mb-1.5">
              CARD OF THE DAY
            </div>
            <div className="heading-font text-base leading-tight">{card.name}</div>
            <div className="text-[10px] font-bold text-[var(--c-steel)] mt-0.5">
              {card.rarity || 'Common'} · {card.type}
              {card.set ? ` · ${card.set}` : ''}
            </div>
            <div className="text-[10px] font-bold text-[var(--c-steel)] mt-1">
              Tap the card to inspect it. A new one every day.
            </div>
            {onBuild && (
              <button
                type="button"
                onClick={() => {
                  setBuildWith(card.id);
                  onBuild();
                }}
                className="btn-pop heading-font text-[10px] mt-2 bg-[var(--c-yellow)] px-2 py-1 ink-border-sm shadow-hard-black-xs"
              >
                BUILD A DECK WITH IT ▸
              </button>
            )}
          </div>
        </div>
      </div>
      {open && (
        <Card3DInspector
          def={card}
          meta={[
            { label: 'Rarity', value: card.rarity || 'Common' },
            { label: 'Set', value: card.set || '—' },
            { label: 'Type', value: card.type },
          ]}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
