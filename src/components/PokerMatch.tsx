/**
 * One mounted match: builds the engine setup for the player's choice (their
 * deck or a random one, table size, format, bot difficulty) and renders the
 * table. Split out of App.tsx so the engine, bots and table only load when a
 * match starts — they are not part of the first paint.
 */
import React, { useState } from 'react';
import { MODES, type ModeId } from '../game/poker/constants';
import { buildDeck, deckDefFromCustom, randomLeader, type DeckDef } from '../game/poker/deck';
import type { MatchSetup as EngineSetup } from '../game/poker/engine';
import { rngOn } from '../game/poker/rng';
import { ordinal } from '../game/poker/rewards';
import { POOL_BY_ID } from '../game/poker/cardpool';
import type { FormatId } from '../game/poker/formats';
import type { MutatorId } from '../game/poker/mutators';
import { cpuTableSetup } from '../game/poker/sim';
import type { DeckRow } from '../lib/supabase';
import { encodeDeckCode } from '../meta/deckcode';
import { CPU_DIFFICULTIES, rewardDifficulty, type CpuDifficultyId } from '../meta/matchPrefs';
import { PokerTable, type PokerTableProps } from './PokerTable';

export type PlaySetup = {
  mode: ModeId;
  seats: number;
  difficulty: CpuDifficultyId;
  /** Guided first game: loose bots, helper on, coach. */
  tutorial?: boolean;
  /** Fixed match seed: a replay (Q1) or the Daily Table (Q15). */
  seed?: number;
  /** Nothing is paid and no ticket is minted (replays, pasted decks, practice). */
  unrewarded?: boolean;
  /** A label kept in Match History ("Replay", "Daily 2026-10-11", …). */
  tag?: string;
  /** Deck format (R6): random and bot decks are filled inside it. */
  format?: FormatId;
  /** Weekly twist(s) (R3). */
  mutators?: MutatorId[];
  /** Practice: a Location id forced into every cycle (Q18). */
  location?: string;
  /** Opponent decks from codes (Q3 ghost seats), seated first after you. */
  ghosts?: { name: string; leader_id: string; card_ids: string[] }[];
} & ({ kind: 'custom'; deck: DeckRow } | { kind: 'random' });

/** The engine setup for a match: the human at seat 0, bots drawn from the
 * Leader pool by the match seed (so a replay reproduces them). */
export function buildTable(
  setup: PlaySetup,
  matchSeed: number,
  playerName: string,
): { engine: EngineSetup; deckCode?: string } {
  const mode = MODES[setup.mode];
  const rng = rngOn({ rng: matchSeed * 7919 + 1 });
  let deck: DeckDef;
  let deckCode: string | undefined;
  if (setup.kind === 'random') {
    const leader = randomLeader(rng);
    deck = buildDeck(leader, mode, rng, `${leader.name} — Random`, setup.format);
  } else {
    deck = deckDefFromCustom(setup.deck.leader_id, setup.deck.card_ids, setup.deck.name);
    try {
      deckCode = encodeDeckCode(
        setup.deck.leader_id,
        setup.deck.card_ids,
        setup.mode,
        setup.format,
      );
    } catch {
      deckCode = undefined;
    }
  }
  const skill = setup.tutorial
    ? 0.25
    : (CPU_DIFFICULTIES.find((d) => d.id === setup.difficulty)?.skill ?? 0.6);
  const engine = cpuTableSetup({
    seed: matchSeed,
    mode: setup.mode,
    seats: setup.seats,
    seat0: { name: playerName, human: true, deck },
    skill,
    format: setup.format,
    named: !setup.tutorial,
    fixedSeats: (setup.ghosts ?? [])
      .filter((g) => POOL_BY_ID[g.leader_id])
      .map((g) => ({ name: g.name, deck: deckDefFromCustom(g.leader_id, g.card_ids, g.name) })),
  });
  if (setup.mutators?.length) engine.mutators = [...setup.mutators];
  if (setup.location && POOL_BY_ID[setup.location]?.type === 'Location')
    engine.forcedLocation = POOL_BY_ID[setup.location];
  if (setup.tutorial) {
    // Loose bots for the guided game: they call more and fold less.
    for (const s of engine.seats.slice(1))
      if (s.persona) s.persona = { ...s.persona, tightness: s.persona.tightness - 0.2 };
  }
  return { engine, deckCode };
}

export default function PokerMatch({
  play,
  matchSeed,
  playerName,
  ...table
}: {
  play: PlaySetup;
  matchSeed: number;
  playerName: string;
} & Omit<
  PokerTableProps,
  'setup' | 'tutorial' | 'humanDeckCode' | 'tableTag' | 'shareLine' | 'rewardTier'
>) {
  const [built] = useState(() => buildTable(play, matchSeed, playerName));
  return (
    <PokerTable
      {...table}
      setup={built.engine}
      tutorial={play.tutorial}
      humanDeckCode={built.deckCode}
      tableTag={play.tag}
      rewardTier={rewardDifficulty(play.difficulty)}
      shareLine={
        play.tag?.startsWith('Daily')
          ? (place, seats, hands) =>
              `FryCards ${play.tag} · ${ordinal(place)} of ${seats} · ${hands} hands`
          : undefined
      }
    />
  );
}
