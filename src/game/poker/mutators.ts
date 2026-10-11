/**
 * Weekly Table Rules (AUDIT §4 R3): one rule twist per ISO week, chosen by
 * hashing the week key (no server needed, like Card of the Day). A twist is
 * opted into on the play screen and copied onto the match
 * (`MatchSetup.mutators`); `modeOf` merges its numeric overrides, so the
 * engine, the bots and the table all read the same numbers.
 *
 * Twists never shorten a match (the server's reward floor still holds), so
 * a twisted table pays normal rewards.
 */
import type { ModeConfig } from './constants';

export type MutatorId = 'deepStacks' | 'slowBlinds' | 'bigHands' | 'steadyNerve';

export interface Mutator {
  id: MutatorId;
  name: string;
  blurb: string;
  mode?: (c: ModeConfig) => Partial<ModeConfig>;
  /** Extra starting nerve. */
  nerve?: number;
}

export const MUTATORS: Record<MutatorId, Mutator> = {
  deepStacks: {
    id: 'deepStacks',
    name: 'Deep Stacks',
    blurb: 'Everyone starts with half again as many chips.',
    mode: (c) => ({ stackChips: Math.round((c.stackChips * 1.5) / 10) * 10 }),
  },
  slowBlinds: {
    id: 'slowBlinds',
    name: 'Slow Blinds',
    blurb: 'Blind levels last half again as long.',
    mode: (c) => ({ levelMs: Math.round(c.levelMs * 1.5) }),
  },
  bigHands: {
    id: 'bigHands',
    name: 'Full Hands',
    blurb: 'Start with one more power card and hold one more.',
    mode: (c) => ({ handStart: c.handStart + 1, handCap: c.handCap + 1 }),
  },
  steadyNerve: {
    id: 'steadyNerve',
    name: 'Steady Nerve',
    blurb: 'Every seat starts with 1 extra nerve.',
    nerve: 1,
  },
};
export const MUTATOR_IDS = Object.keys(MUTATORS) as MutatorId[];

export function applyMutators(c: ModeConfig, ids: readonly MutatorId[] | undefined): ModeConfig {
  if (!ids?.length) return c;
  let out = c;
  for (const id of ids) {
    const f = MUTATORS[id]?.mode;
    if (f) out = { ...out, ...f(out) };
  }
  return out;
}

export function mutatorNerve(ids: readonly MutatorId[] | undefined): number {
  return (ids ?? []).reduce((a, id) => a + (MUTATORS[id]?.nerve ?? 0), 0);
}

/** ISO week key, e.g. "2026-W41" (UTC). */
export function isoWeekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

/** FNV-1a, the same hash as Card of the Day. */
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** This week's twist. */
export function weeklyMutator(weekKey = isoWeekKey()): Mutator {
  return MUTATORS[MUTATOR_IDS[fnv(weekKey) % MUTATOR_IDS.length]];
}
