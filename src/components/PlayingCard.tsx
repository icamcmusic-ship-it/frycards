/**
 * A standard playing card for the poker table, drawn from Kenney's Playing
 * Cards Pack (CC0 — www.kenney.nl; sprites cropped to the card in
 * src/assets/playing-cards/). The sprites are 42×60 pixel art (5:7, the same
 * proportions as a FryCards card) and are always scaled by whole numbers with
 * `image-rendering: pixelated` so they stay crisp.
 *
 * States: face-up, face-down (a hidden card, or Fog), blinded (a hole-card
 * debuff: the holder can't look at it this street), wild (Wild keyword), and
 * known/public markers. The four-colour deck option tints diamonds blue and
 * clubs green.
 */
import React from 'react';
import { EyeOff, Eye, Sparkles } from 'lucide-react';
import { cardLabel, RANK_CHARS, SUIT_NAMES } from '../game/poker/evaluator';
import { cn } from '../lib/utils';

const SPRITES = import.meta.glob('../assets/playing-cards/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function sprite(name: string): string {
  return SPRITES[`../assets/playing-cards/${name}.png`] ?? '';
}

const RANK_FILE = ['02', '03', '04', '05', '06', '07', '08', '09', '10', 'J', 'Q', 'K', 'A'];

export function cardSprite(r: number, s: number): string {
  return sprite(`${SUIT_NAMES[s]}_${RANK_FILE[r - 2]}`);
}

export const CARD_BACK = sprite('back');
export const CARD_BLANK = sprite('empty');

/** Native sprite size. */
export const SPRITE_W = 42;
export const SPRITE_H = 60;

/** Four-colour deck: diamonds blue, clubs green (hearts stay red, spades black). */
const FOUR_COLOR_FILTER: Record<number, string | undefined> = {
  2: 'hue-rotate(215deg) saturate(1.4)',
  3: 'sepia(1) hue-rotate(70deg) saturate(3) brightness(0.8)',
};

export interface PlayingCardProps {
  key?: React.Key;
  /** Rank 2–14 and suit 0–3; rank 0 = a card this seat cannot see. */
  r: number;
  s: number;
  /** Integer scale of the 42×60 sprite. */
  scale?: number;
  faceDown?: boolean;
  blinded?: boolean;
  wild?: boolean;
  /** Face-up for the whole table (Reveal, Open Hand, showdown). */
  isPublic?: boolean;
  /** Seen by someone else (a Peek or Mark on your own card). */
  known?: boolean;
  /** Dim (folded, mucked). */
  dim?: boolean;
  highlight?: boolean;
  fourColor?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
}

export function PlayingCard({
  r,
  s,
  scale = 2,
  faceDown,
  blinded,
  wild,
  isPublic,
  known,
  dim,
  highlight,
  fourColor,
  onClick,
  className,
  title,
}: PlayingCardProps) {
  const hidden = faceDown || blinded || r === 0;
  const src = hidden ? CARD_BACK : cardSprite(r, s);
  const label = hidden
    ? blinded
      ? 'Blinded hole card'
      : 'Face-down card'
    : `${RANK_CHARS[r - 2] === 'T' ? '10' : RANK_CHARS[r - 2]} of ${SUIT_NAMES[s]}${wild ? ', wild' : ''}`;
  const w = SPRITE_W * scale;
  const h = SPRITE_H * scale;
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title ?? (hidden ? label : cardLabel({ r, s }))}
      aria-label={label}
      data-card={hidden ? 'hidden' : cardLabel({ r, s })}
      className={cn(
        'relative inline-block shrink-0 select-none transition-transform',
        onClick && 'btn-pop cursor-pointer hover:-translate-y-1',
        highlight && '-translate-y-1.5',
        dim && 'opacity-40 saturate-50',
        className,
      )}
      style={{ width: w, height: h }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        width={w}
        height={h}
        className={cn('block w-full h-full', highlight && 'drop-shadow-[0_0_6px_var(--c-yellow)]')}
        style={{
          imageRendering: 'pixelated',
          filter: !hidden && fourColor ? FOUR_COLOR_FILTER[s] : undefined,
        }}
      />
      {blinded && (
        <span className="absolute inset-0 flex items-center justify-center">
          <EyeOff
            className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            style={{ width: w * 0.4, height: w * 0.4 }}
          />
        </span>
      )}
      {wild && !hidden && (
        <span
          className="absolute -top-1.5 -right-1.5 rounded-full bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm p-0.5"
          title="Wild: counts as any suit"
        >
          <Sparkles className="w-3 h-3" />
        </span>
      )}
      {(isPublic || known) && !hidden && (
        <span
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--c-ink)] text-[var(--c-paper)] px-1 fs-xs font-black leading-[12px] whitespace-nowrap"
          title={isPublic ? 'Face-up for the whole table' : 'Someone else knows this card'}
        >
          <Eye className="inline w-2.5 h-2.5 -mt-px" /> {isPublic ? 'SHOWN' : 'SEEN'}
        </span>
      )}
    </Tag>
  );
}
