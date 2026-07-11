import React from 'react';
import { PopButton } from './ui';

interface ChangelogEntry {
  version: string;
  date?: string;
  items: string[];
}

// Condensed, user-facing view of CHANGELOG.md — trimmed to the highlights
// players actually care about (new features, balance headlines), not every
// internal playtest data point tracked in the full file.
const ENTRIES: ChangelogEntry[] = [
  {
    version: 'Unreleased',
    items: [
      'Economy 2.0: new 7-tier rarity ladder with the new FULL-ART tier, a fully rebuilt pack lineup (Standard, Deluxe, Set Spotlight, Event, Mythic Vault, Collector Booster Box), and transparent in-store pull rates — tap "VIEW PULL RATES & PITY" on any pack.',
      'Pity timers & duplicate protection: a Full-Art or better is guaranteed within 10 packs and a Mythic within 60 (the Mythic Vault has its own hard 20-box pity); premium slots prefer cards you still need, and spare copies past the collection cap auto-convert to Shards.',
      'Shards crafting: disenchant spare cards into Shards and craft ANY card directly — including foils — so nothing is permanently locked behind pack luck. Craft/melt from the card inspector in your Collection.',
      'Daily Free Pack: claim a free 3-card pack in the Store every 20 hours.',
      'Deck copy limits now scale with rarity: 3 copies (Common–Rare), 2 (Super-Rare/Ultra-Rare), 1 (Full-Art/Mythic).',
      'Every keyword on every card is now tappable — tap a keyword chip for a plain-language explainer popup.',
      'Card art is never cropped any more: every card face shows the full 4:3 illustration, and expanding a card shows a straight enlargement of the same universal template everywhere (match, Collection, Deck Builder).',
      'Bigger, bolder match board: larger units, dice, hand cards and battle log so the game fills your screen.',
      'Smarter CPU opponent: threshold-aware rerolling, much better combat targeting (it respects Ward, Bulwark, Frenzy and Toll math), and it no longer feeds attacks into Guard walls. It beats its old self 57/43.',
      'New universal card template with a dice-medallion cost badge, rounded rarity/keyword pill styling and a rarity-tinted header — used everywhere a card is shown: match, Collection, Deck Builder, pack opening and the new expanded card viewer.',
      'Quicksell: sell spare cards straight from the Collection for a fixed gold price by rarity (Common 10g, Uncommon 25g, Rare 60g, Super-Rare 150g, Ultra-Rare 400g, Mythic 1000g). Foil copies always sell for 2.5x. Pack gold prices raised roughly 10% to balance the new gold faucet.',
      'Foil cards now render with a real built-in glowing/shimmering foil effect (previously only a flat overlay in pack reveals); every pack pull still has its existing per-pack chance to come out foil.',
      'Deck Builder now consumes cards: the same physical copy of a card can no longer be committed to two decks at once. Deleting a deck automatically frees its cards back up for your other decks.',
      'Card inspection ("details" in Deck Builder, tapping a card in Collection) now opens a shared expanded card viewer using the same universal template, instead of a stripped-down info box.',
      'The old resource/elements game is fully retired — FryCards now runs the v4.2 dice-placement rules everywhere: match, Collection, Store and Deck Builder.',
      'New rarity ladder: Common, Uncommon, Rare, Super-Rare, Ultra-Rare, Mythic (Ultra-Rare replaces Legendary on all cards and pack odds).',
      'Collection and pack reveals now show real v4.2 card faces — cast-slot thresholds, ATK/HP and the current keywords instead of the old costs and elements.',
      'Renamed the game to FryCards across the whole app.',
      'New Settings page: pick from 7 color themes, saved locally on your device.',
      'New Changelog page (you are here!).',
      'CPU opponents now build a freshly randomized deck every match instead of picking from a fixed list.',
      'Deck Builder: added a QUICKBUILD button to auto-fill a legal deck from your collection, plus a live stats panel (cast-slot curve, card types, keywords).',
      'Pack opening redesigned: cinematic one-at-a-time reveal with rarity glow effects and an end-of-pack summary screen.',
    ],
  },
  {
    version: 'v4.2',
    items: [
      'New interactive match UI for the dice-placement rules: five-dice tray, reroll, Snap Charms, Twin staging, Echo recasting, Ultimate abilities and more.',
      'Play screen offers twelve archetype decks; the CPU always picks a different one.',
      'How to Play rewritten as a condensed rulebook covering every keyword and combo pattern.',
      'Twelve new keywords added: Resolve, Ultimate, Bulwark, Toll, Avenge, Crescendo, Aftershock, Snap, Tribute, Excavate, Contested.',
    ],
  },
  {
    version: 'v4.1',
    items: [
      'Locations no longer cost a die — one free Location cast per turn.',
      'Leader HP raised to lengthen matches.',
      'Board wipe Events added for control decks.',
      'Smarter CPU: better free-Location timing, combo-aware rerolling, start-of-game mulligan.',
    ],
  },
  {
    version: 'v4.0',
    items: [
      'Errata pass across the ruleset; deck size set to 30 cards.',
      'All 193 cards remapped onto the new dice-placement mechanics.',
      'Twelve archetype decks built across all six Leaders.',
      'Advanced CPU with mulligans and deck-aware rerolling.',
    ],
  },
  {
    version: 'v3.0',
    items: [
      'Major rules overhaul: five-dice placement, one reroll, Combo patterns, sequential targeted combat.',
      'New engine and card set built for the new rules.',
    ],
  },
  {
    version: 'V1.9 and earlier',
    items: [
      'Leader rebalancing validated across hundreds of simulated games.',
      'Shell Game, Armor and Location rework passes.',
      'Negative-path fuzz testing added to keep the server authoritative.',
      'Deck import/export codes, match log export, game speed setting, search & filters added to Collection and Deck Builder.',
    ],
  },
];

export function ChangelogScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">CHANGELOG</h1>
      </div>

      <div className="p-6 max-w-3xl mx-auto flex flex-col gap-5">
        {ENTRIES.map((entry) => (
          <div
            key={entry.version}
            className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--c-steel)]">
              <span className="heading-font text-sm text-[var(--c-yellow)]">{entry.version}</span>
            </div>
            <ul className="px-5 py-3 flex flex-col gap-1.5 list-disc">
              {entry.items.map((item, i) => (
                <li key={i} className="text-[12px] font-bold text-[var(--c-ink)]/85 leading-snug">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="text-center text-[10px] font-mono font-bold text-[var(--c-steel)]/70 mt-2 mb-6">
          FULL DETAILS · CHANGELOG.md
        </div>
      </div>
    </div>
  );
}
