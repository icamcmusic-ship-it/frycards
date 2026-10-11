/**
 * Headless bot-versus-bot matches — the balance report script, the fuzz test
 * and the bust fast-forward all drive matches through this.
 */
import { botAction, botRng } from './bot';
import { MODES, type ModeId } from './constants';
import { buildDeck, type DeckDef } from './deck';
import type { FormatId } from './formats';
import {
  applyInPlace,
  createMatch,
  fallbackAction,
  IllegalAction,
  personaFor,
  waitingOn,
  type Action,
  type Match,
  type MatchSetup,
  type Persona,
} from './engine';
import { POOL_LEADERS } from './cardpool';
import { rngOn, shuffle } from './rng';
import { viewFor } from './view';

/** Seat count, mode and Leaders for a CPU table, drawn from the seed so a
 * replay reproduces them. Seat 0 can be supplied (the human's deck). */
export function cpuTableSetup(opts: {
  seed: number;
  mode: ModeId;
  seats: number;
  seat0?: { name: string; human: boolean; deck: DeckDef };
  skill?: number;
  /** Bot seats with a given deck (ghost opponents, Q3), seated before the fill. */
  fixedSeats?: { name: string; deck: DeckDef }[];
  /** Deck format the random bot decks are filled in (R6). */
  format?: FormatId;
  /** Give bots a seeded handle after the Leader name (Q14). */
  named?: boolean;
}): MatchSetup {
  const holder = { rng: (opts.seed ^ 0x5bd1e995) | 0 };
  const rng = rngOn(holder);
  const mode = MODES[opts.mode];
  const taken = new Set([
    ...(opts.seat0 ? [opts.seat0.deck.leader.id] : []),
    ...(opts.fixedSeats ?? []).map((f) => f.deck.leader.id),
  ]);
  const leaders = shuffle(
    POOL_LEADERS.filter((l) => !taken.has(l.id)),
    rng,
  );
  const seats: MatchSetup['seats'] = [];
  if (opts.seat0) seats.push(opts.seat0);
  for (const f of opts.fixedSeats ?? []) {
    if (seats.length >= opts.seats) break;
    seats.push({
      name: f.name,
      human: false,
      deck: f.deck,
      persona: personaFor(f.deck.leader, opts.skill ?? 0.6),
    });
  }
  // Handles come from their own stream so naming never moves the deal.
  const names = opts.named ? shuffle([...BOT_HANDLES], rngOn({ rng: opts.seed ^ 0x2545f491 })) : [];
  for (let i = 0; seats.length < opts.seats; i++) {
    const leader = leaders[i % leaders.length];
    seats.push({
      name: names.length ? `${leader.name} · ${names[i % names.length]}` : leader.name,
      human: false,
      deck: buildDeck(leader, mode, rng, undefined, opts.format),
      persona: personaFor(leader, opts.skill ?? 0.6),
    });
  }
  return { seed: opts.seed, mode: opts.mode, seats };
}

/** Seeded bot handles (Q14). */
export const BOT_HANDLES = [
  'Salt-Tooth Maren',
  'Lucky Ollo',
  'Two-Pair Tamsin',
  'Grim Bettany',
  'Silent Quill',
  'Old Fenwick',
  'Ruby Cask',
  'Dealer Dax',
  'Velvet Juno',
  'Iron Petra',
  'Cardsharp Ines',
  'Rook Halloway',
];

/** One-word play style from a persona, shown on a bot's seat plate (Q14). */
export function styleTag(p: Persona): 'LOOSE' | 'TIGHT' | 'TRAPPY' | 'STEADY' {
  if (p.bluff >= 0.18) return 'TRAPPY';
  if (p.tightness <= 0.46) return 'LOOSE';
  if (p.tightness >= 0.56) return 'TIGHT';
  return 'STEADY';
}

/** Let bots act until a human is needed or the match ends. Returns the
 * actions taken (for the replay log). `maxSteps` guards against a stuck loop. */
export function runBots(
  m: Match,
  opts: {
    botSeed: number;
    humanSeats?: number[];
    maxSteps?: number;
    autoStart?: boolean;
    stopAtHandEnd?: boolean;
  },
): Action[] {
  const log: Action[] = [];
  const humans = new Set(opts.humanSeats ?? []);
  const rng = botRng(opts.botSeed);
  for (let step = 0; step < (opts.maxSteps ?? 200000); step++) {
    const w = waitingOn(m);
    if (w.kind === 'over') break;
    let action: Action | null;
    if (w.kind === 'start') {
      if (!opts.autoStart) break;
      if (opts.stopAtHandEnd && m.hand?.done) break;
      action = { type: 'start', dt: 2000 };
    } else {
      const seats = w.kind === 'window' ? w.seats : [w.seat];
      const bot = seats.find((s) => !humans.has(s));
      if (bot === undefined) break;
      action = botAction(viewFor(m, bot), bot, rng) ?? fallbackAction(m, bot);
      if (!action) break;
      try {
        applyInPlace(m, action);
      } catch (e) {
        // A Veiled hit the bot could not see: retry without powers. Any
        // other refusal is a real bug and still throws.
        if (!(e instanceof IllegalAction) || e.code !== 'hiddenTarget') throw e;
        action =
          botAction(viewFor(m, bot), bot, rng, { noPowers: true }) ?? fallbackAction(m, bot)!;
        applyInPlace(m, action);
      }
      log.push(action);
      continue;
    }
    applyInPlace(m, action);
    log.push(action);
  }
  return log;
}

export function simulateMatch(
  setup: MatchSetup,
  botSeed: number,
): { match: Match; actions: Action[] } {
  const match = createMatch(setup);
  const actions = runBots(match, { botSeed, autoStart: true });
  return { match, actions };
}

export type { Persona };
