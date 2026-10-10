/**
 * Headless bot-versus-bot matches — the balance report script, the fuzz test
 * and the bust fast-forward all drive matches through this.
 */
import { botAction, botRng } from './bot';
import { MODES, type ModeId } from './constants';
import { buildDeck, type DeckDef } from './deck';
import {
  applyInPlace,
  createMatch,
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
}): MatchSetup {
  const holder = { rng: (opts.seed ^ 0x5bd1e995) | 0 };
  const rng = rngOn(holder);
  const mode = MODES[opts.mode];
  const taken = new Set(opts.seat0 ? [opts.seat0.deck.leader.id] : []);
  const leaders = shuffle(
    POOL_LEADERS.filter((l) => !taken.has(l.id)),
    rng,
  );
  const seats: MatchSetup['seats'] = [];
  if (opts.seat0) seats.push(opts.seat0);
  for (let i = 0; seats.length < opts.seats; i++) {
    const leader = leaders[i % leaders.length];
    seats.push({
      name: leader.name,
      human: false,
      deck: buildDeck(leader, mode, rng),
      persona: personaFor(leader, opts.skill ?? 0.6),
    });
  }
  return { seed: opts.seed, mode: opts.mode, seats };
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
      action = botAction(viewFor(m, bot), bot, rng);
      if (!action)
        action = w.kind === 'window' ? { type: 'pass', seat: bot } : { type: 'fold', seat: bot };
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
