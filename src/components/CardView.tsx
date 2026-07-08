import React, { useState } from 'react';
import { GameCard, GameState } from '../types';
import { cn } from '../lib/utils';
import { Shield, Snowflake, Flame, Zap, Maximize2, X } from 'lucide-react';
import { effAttack, effMaxHealth, effArmor } from '../game/engine';
import { getCardBackImage } from '../meta/cardback';
import { keywordDescription } from '../game/keywords';

interface CardViewProps {
  key?: React.Key;
  card: GameCard;
  onClick?: () => void;
  className?: string;
  selected?: boolean;
  playable?: boolean;
  targetable?: boolean;
  faceDown?: boolean;
  compact?: boolean;
  gameState?: GameState;
}

// Monochrome & Pop element chips: ink/paper/steel with pop yellow + red accents.
const ELEMENT_COLORS: Record<string, string> = {
  Light: 'bg-[#FFD54F] text-[#1A1A1A]',
  Dark: 'bg-[#1A1A1A] text-[#F7F7F7]',
  Frost: 'bg-[#F7F7F7] text-[#2C3E50]',
  Flame: 'bg-[#E53935] text-[#F7F7F7]',
  Tech: 'bg-[#2C3E50] text-[#F7F7F7]',
  Nature: 'bg-[#F7F7F7] text-[#1A1A1A]',
  Order: 'bg-[#FFD54F] text-[#2C3E50]',
  Chaos: 'bg-[#E53935] text-[#1A1A1A]',
  Generic: 'bg-[#2C3E50] text-[#F7F7F7]',
};

// Soft tint used as the card frame background — one per element, blended as a
// diagonal gradient for dual-element cards.
const ELEMENT_TINTS: Record<string, string> = {
  Light: '#FFF3C4',
  Dark: '#D7D2E0',
  Frost: '#D9EEF7',
  Flame: '#FBD9D3',
  Tech: '#D6E0EA',
  Nature: '#DCEFD8',
  Order: '#F5E9C9',
  Chaos: '#EFD5EE',
  Generic: '#EDEDED',
};

export function elementBackground(elements: string[] | undefined): React.CSSProperties {
  const els = (elements || []).filter((e) => ELEMENT_TINTS[e]);
  if (els.length === 0) return { backgroundColor: '#F7F7F7' };
  if (els.length === 1) return { backgroundColor: ELEMENT_TINTS[els[0]] };
  const stops = els.map(
    (e, i) => `${ELEMENT_TINTS[e]} ${Math.round((i / (els.length - 1)) * 100)}%`,
  );
  return { backgroundImage: `linear-gradient(135deg, ${stops.join(', ')})` };
}

const RARITY_STYLE: Record<string, string> = {
  Common: 'bg-[#1A1A1A] text-[#F7F7F7]',
  Uncommon: 'bg-[#2C3E50] text-[#F7F7F7]',
  Rare: 'bg-[#E53935] text-[#F7F7F7]',
  'Super-Rare': 'bg-[#1A1A1A] text-[#FFD54F]',
  Legendary: 'bg-gradient-to-r from-[#2C3E50] to-[#E53935] text-[#F7F7F7]',
  Mythic: 'bg-gradient-to-r from-[#E53935] to-[#FFD54F] text-[#1A1A1A]',
};

function getEffectiveAtk(card: GameCard, state?: GameState): number {
  if (state) {
    return effAttack(card, state);
  }
  const item = (card.attachedItems || []).reduce((s, it) => s + (it.attach?.attack || 0), 0);
  return Math.max(0, (card.attack || 0) + card.tempAtk + item - card.witherAtk);
}

function getEffectiveHp(card: GameCard, state?: GameState): number {
  if (state) {
    return effMaxHealth(card, state) - card.damageTaken;
  }
  const itemHp = (card.attachedItems || []).reduce((s, it) => s + (it.attach?.health || 0), 0);
  const baseMax = Math.max(1, (card.health || 0) + card.tempHp - card.witherHp);
  return baseMax + itemHp - card.damageTaken - card.bonusDamage;
}

function costTotal(card: GameCard): number {
  return Object.values(card.cost || {}).reduce((a, b) => a + b, 0);
}

/** Keyword chip that opens a rules popup on click (does not trigger card actions). */
function KeywordChip({
  kw,
  onOpen,
  className,
}: {
  key?: React.Key;
  kw: string;
  onOpen: (kw: string) => void;
  className?: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen(kw);
      }}
      title="Click for keyword rules"
      className={cn(
        'text-[7px] font-bold px-0.5 bg-[#FFD54F] text-[#1A1A1A] hover:bg-[#E53935] hover:text-[#F7F7F7] cursor-help transition-colors',
        className,
      )}
    >
      {kw}
    </button>
  );
}

/** Fixed-position keyword rules popup. */
function KeywordPopup({ kw, onClose }: { kw: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#1A1A1A]/70 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-[#F7F7F7] text-[#1A1A1A] ink-border-md shadow-hard-yellow max-w-sm w-full p-5 banner-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-2">
          <span className="heading-font text-lg bg-[#FFD54F] px-2 py-0.5 ink-border-sm">{kw}</span>
          <button
            onClick={onClose}
            className="btn-pop bg-[#E53935] text-[#F7F7F7] p-1 ink-border-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm font-bold leading-snug">{keywordDescription(kw)}</p>
      </div>
    </div>
  );
}

/** Full-size expanded card detail modal. */
function ExpandedCard({
  card,
  gameState,
  onClose,
  onKeyword,
}: {
  card: GameCard;
  gameState?: GameState;
  onClose: () => void;
  onKeyword: (kw: string) => void;
}) {
  const showStats = card.attack !== undefined || card.health !== undefined;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1A1A1A]/80 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-[320px] max-w-full max-h-[90vh] ink-border-lg shadow-hard-black-lg flex flex-col text-[#1A1A1A] banner-pop"
        style={elementBackground(card.elements)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-3 py-2 bg-[#1A1A1A] shrink-0">
          <span className="heading-font text-base text-[#FFD54F] truncate">{card.name}</span>
          <button
            onClick={onClose}
            className="btn-pop bg-[#E53935] text-[#F7F7F7] p-1 ink-border-sm shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col pb-3">
          <div className="px-3 py-1.5 flex justify-between items-center gap-2 text-xs font-black shrink-0">
            <span
              className={cn(
                'px-1.5 py-0.5 heading-font text-[10px]',
                RARITY_STYLE[card.rarity || 'Common'],
              )}
            >
              {(card.rarity || card.type).toUpperCase()}
            </span>
            {card.cost && (
              <span className="flex items-center gap-1 heading-font">
                <Zap className="w-3.5 h-3.5" />
                {costTotal(card)}
                <span className="flex gap-0.5">
                  {Object.entries(card.cost).map(([el, amt]) => (
                    <span key={el} className={cn('px-1 text-[9px] font-bold', ELEMENT_COLORS[el])}>
                      {amt} {el}
                    </span>
                  ))}
                </span>
              </span>
            )}
          </div>
          {card.image && (
            <div className="mx-3 ink-border-sm overflow-hidden aspect-[4/3] bg-[#2C3E50] shrink-0">
              <img
                src={card.image}
                alt={card.name}
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
          )}
          <div className="px-3 py-2 flex flex-col gap-1.5">
            <div className="text-[10px] font-mono font-black uppercase text-[#2C3E50]">
              {card.type} · {(card.elements || []).join(' / ')}
            </div>
            {card.keywords && card.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {card.keywords.map((kw) => (
                  <KeywordChip
                    key={kw}
                    kw={kw}
                    onOpen={onKeyword}
                    className="text-[10px] px-1.5 py-0.5 ink-border-sm"
                  />
                ))}
              </div>
            )}
            {card.text && <p className="text-[12px] font-bold leading-snug">{card.text}</p>}
            {card.effect?.text && card.effect.text !== card.text && (
              <p className="text-[11px] font-medium leading-snug text-[#2C3E50]">
                {card.effect.text}
              </p>
            )}
            {card.attach && (
              <p className="text-[11px] font-bold">
                Grants +{card.attach.attack} ATK / +{card.attach.health} HP to the host Unit.
              </p>
            )}
            {(card.attachedItems || []).length > 0 && (
              <div className="text-[11px] font-bold">
                Attached: {card.attachedItems.map((i) => i.name).join(', ')}
              </div>
            )}
          </div>
        </div>
        {showStats && (
          <div className="px-3 py-2 flex justify-between items-center border-t-2 border-[#1A1A1A] shrink-0">
            <span className="bg-[#1A1A1A] text-[#FFD54F] px-2 py-0.5 text-sm font-black heading-font">
              ATK {getEffectiveAtk(card, gameState)}
            </span>
            {effArmor(card) > 0 && (
              <span className="flex items-center gap-1 px-2 bg-[#1A1A1A] text-[#F7F7F7] text-xs font-bold">
                <Shield className="w-3.5 h-3.5" />
                {effArmor(card)}
              </span>
            )}
            <span
              className={cn(
                'px-2 py-0.5 text-sm font-black heading-font',
                card.damageTaken + card.bonusDamage > 0
                  ? 'bg-[#E53935] text-[#F7F7F7]'
                  : 'bg-[#2C3E50] text-[#F7F7F7]',
              )}
            >
              DEF {getEffectiveHp(card, gameState)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function CardView({
  card,
  onClick,
  className,
  selected,
  playable,
  targetable,
  faceDown,
  compact,
  gameState,
}: CardViewProps) {
  // Standard vertical TCG proportions: 5:7 outer frame.
  const size = compact ? 'w-[104px] h-[146px]' : 'w-[120px] h-[168px]';
  const [expanded, setExpanded] = useState(false);
  const [keywordPopup, setKeywordPopup] = useState<string | null>(null);

  if (faceDown) {
    const back = getCardBackImage();
    return (
      <div
        className={cn(
          size,
          'classic-black-back ink-border-sm shadow-hard-black-xs flex items-center justify-center overflow-hidden relative select-none',
          className,
        )}
      >
        {back ? (
          <img src={back} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-between p-2 relative">
            {/* Outer decorative borders to look like a real physical card back */}
            <div className="absolute inset-1.5 border-2 border-[#FFD54F]/80 opacity-90 rounded pointer-events-none" />
            <div className="absolute inset-2.5 border border-[#F7F7F7]/40 opacity-50 rounded pointer-events-none" />

            {/* Top comic label */}
            <div className="text-[7px] heading-font text-[#FFD54F] tracking-widest opacity-80 mt-1">
              OPERATIVE
            </div>

            {/* Central multi-layered retro comic burst logo */}
            <div className="relative flex items-center justify-center w-12 h-12">
              <div className="absolute w-10 h-10 bg-[#E53935] rotate-12 ink-border-xs shadow-md" />
              <div className="absolute w-9 h-9 bg-[#2C3E50] -rotate-12 ink-border-xs" />
              <div className="absolute w-8 h-8 bg-[#FFD54F] rotate-45 ink-border-xs flex items-center justify-center">
                <span className="-rotate-45 heading-font text-[9px] font-black text-[#1A1A1A] tracking-tighter">
                  POP
                </span>
              </div>
            </div>

            {/* Bottom text */}
            <div className="text-[6px] font-mono text-[#F7F7F7] opacity-60 mb-0.5 uppercase tracking-wider">
              MULTIVERSE TCG
            </div>
          </div>
        )}
      </div>
    );
  }

  const isLeader = card.type === 'Leader';
  const showStats = card.attack !== undefined || card.health !== undefined;

  return (
    <>
      <div
        onClick={onClick}
        className={cn(
          'relative overflow-hidden flex flex-col select-none transition-transform text-[#1A1A1A] ink-border-sm shadow-hard-black-xs',
          size,
          isLeader && 'border-[#FFD54F]',
          playable && 'cursor-pointer hover:-translate-y-2 outline outline-2 outline-[#FFD54F]',
          targetable && 'cursor-pointer outline outline-4 outline-[#E53935] animate-pulse',
          selected && 'outline outline-4 outline-[#FFD54F] -translate-y-2',
          onClick &&
            !playable &&
            !targetable &&
            'cursor-pointer hover:outline hover:outline-2 hover:outline-[#2C3E50]',
          card.frozen > 0 && 'outline outline-2 outline-[#2C3E50]',
          card.summoningSickness && 'opacity-80',
          card.exhausted && 'rotate-6 opacity-75 grayscale-[0.4]',
          className,
        )}
        style={elementBackground(card.elements)}
      >
        {/* Top row: rarity chip + cast cost */}
        <div className="px-1 pt-0.5 pb-0.5 flex justify-between items-center gap-1">
          <span
            className={cn(
              'px-1 text-[7px] font-black font-mono heading-font truncate',
              RARITY_STYLE[card.rarity || 'Common'],
            )}
          >
            {(card.rarity || card.type).toUpperCase()}
          </span>
          {card.cost && (
            <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-black heading-font">
              <Zap className="w-2.5 h-2.5" />
              {costTotal(card)}
              <span className="flex gap-px">
                {Object.entries(card.cost).map(
                  ([el, amt]) =>
                    el !== 'Generic' && (
                      <span
                        key={el}
                        className={cn('px-0.5 text-[7px] font-bold', ELEMENT_COLORS[el])}
                      >
                        {amt}
                        {el[0]}
                      </span>
                    ),
                )}
              </span>
            </span>
          )}
        </div>

        {/* 4:3 art panel inside the vertical frame */}
        <div
          className="relative w-full aspect-[4/3] bg-[#2C3E50] ink-border-sm overflow-hidden mx-auto"
          style={{ width: 'calc(100% - 8px)' }}
        >
          {card.image ? (
            <img
              src={card.image}
              alt={card.name}
              className="w-full h-full object-cover"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#F7F7F7] text-[10px] heading-font">
              {card.type}
            </div>
          )}
          {/* Expand-to-inspect button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            title="Inspect card"
            className="absolute top-0.5 left-0.5 p-0.5 bg-[#1A1A1A]/80 text-[#FFD54F] hover:bg-[#E53935] hover:text-[#F7F7F7] transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          {/* Status badges */}
          <div className="absolute top-0.5 right-0.5 flex flex-col gap-0.5 items-end">
            {card.armor !== undefined && effArmor(card) > 0 && (
              <span className="flex items-center gap-0.5 px-1 bg-[#1A1A1A] text-[#F7F7F7] text-[8px] font-bold">
                <Shield className="w-2.5 h-2.5" />
                {effArmor(card)}
              </span>
            )}
            {card.frozen > 0 && (
              <span className="px-0.5 bg-[#F7F7F7]">
                <Snowflake className="w-3 h-3 text-[#2C3E50]" />
              </span>
            )}
            {card.scorch > 0 && (
              <span className="flex items-center gap-0.5 px-1 bg-[#E53935] text-[#F7F7F7] text-[8px] font-bold">
                <Flame className="w-2.5 h-2.5" />
                {card.scorch}
              </span>
            )}
            {card.glitched && (
              <span className="px-1 bg-[#2C3E50] text-[#FFD54F] text-[7px] font-mono font-bold">
                GLITCH
              </span>
            )}
          </div>
          {(card.attachedItems || []).length > 0 && (
            <div className="absolute bottom-0.5 left-0.5 px-1 bg-[#1A1A1A] text-[#FFD54F] text-[7px] font-bold heading-font truncate max-w-[95%]">
              +{card.attachedItems.map((i) => i.name).join(', ')}
            </div>
          )}
        </div>

        {/* Name + keywords */}
        <div className="flex-1 px-1 pt-0.5 overflow-hidden">
          <div className="heading-font text-[8.5px] leading-tight truncate" title={card.name}>
            {card.name}
          </div>
          {card.keywords && card.keywords.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-0.5">
              {card.keywords.map((kw) => (
                <KeywordChip key={kw} kw={kw} onOpen={setKeywordPopup} />
              ))}
            </div>
          )}
        </div>

        {/* Bottom stats bar */}
        {showStats ? (
          <div className="px-1 py-0.5 flex justify-between items-center border-t-2 border-[#1A1A1A]">
            <span className="bg-[#1A1A1A] text-[#FFD54F] px-1 text-[9px] font-black heading-font">
              ATK {getEffectiveAtk(card, gameState)}
            </span>
            <span className="text-[7px] font-mono font-bold text-[#2C3E50] uppercase truncate px-0.5">
              {card.type}
            </span>
            <span
              className={cn(
                'px-1 text-[9px] font-black heading-font',
                card.damageTaken + card.bonusDamage > 0
                  ? 'bg-[#E53935] text-[#F7F7F7]'
                  : 'bg-[#2C3E50] text-[#F7F7F7]',
              )}
            >
              DEF {getEffectiveHp(card, gameState)}
            </span>
          </div>
        ) : (
          <div className="px-1 py-0.5 border-t-2 border-[#1A1A1A] text-[7px] font-mono font-bold text-[#2C3E50] uppercase flex justify-between">
            <span>{card.type}</span>
            {card.type === 'Charm' && card.charmDuration !== undefined && (
              <span>{card.charmDuration}T</span>
            )}
            {card.type === 'Charm' &&
              card.charmDuration === undefined &&
              card.duration !== undefined && <span>{card.duration}T</span>}
          </div>
        )}
      </div>
      {expanded && (
        <ExpandedCard
          card={card}
          gameState={gameState}
          onClose={() => setExpanded(false)}
          onKeyword={setKeywordPopup}
        />
      )}
      {keywordPopup && <KeywordPopup kw={keywordPopup} onClose={() => setKeywordPopup(null)} />}
    </>
  );
}
