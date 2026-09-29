/**
 * `faceHitDamage` is what the clash buttons print; it has to equal what
 * `resolveClash` actually takes off the defender.
 */
import { describe, expect, test } from 'vitest';
import { CardDef } from './cards';
import {
  DeckDef,
  createGame,
  declareAttackers,
  declareGuards,
  faceHitDamage,
  mulberry32,
  resolveClash,
  summonUnit,
} from './engine';
import { declareAttackLabel } from '../../components/GameV4';

const LEADER: CardDef = {
  id: 'l',
  name: 'L',
  type: 'Leader',
  cost: { generic: 0, pips: {} },
  resolve: 3,
  leaderAbilities: [],
};
const unit = (id: string, might: number, keywords: string[] = []): CardDef => ({
  id,
  name: id,
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might,
  grit: 3,
  keywords,
});
const POOL = (defs: CardDef[]) => Object.fromEntries([LEADER, ...defs].map((d) => [d.id, d]));

function setup(attacker: CardDef, defenderSanctums = 0) {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: Array(30).fill(attacker.id) });
  const s = createGame(dd(), dd(), POOL([attacker]), {
    rng: mulberry32(1),
    shuffle: false,
    handSize: 0,
  });
  s.phase = 'Clash';
  const foe = s.active === 'P1' ? 'P2' : 'P1';
  for (let i = 0; i < defenderSanctums; i++) {
    s.players[foe].locations.push({
      iid: `bul#${i}`,
      def: { id: 'bul', name: 'bul', type: 'Location', subtype: 'Sanctum', keywords: ['Bulwark'] },
      produces: 'Ember',
      exhausted: false,
    } as never);
  }
  const u = summonUnit(s, s.active, attacker);
  u.enteredThisTurn = false;
  return { s, u, foe };
}

describe('faceHitDamage', () => {
  test.each([
    ['plain', unit('plain', 6), 0, 6],
    ['Doublestrike', unit('ds', 6, ['Doublestrike']), 0, 12],
    ['Doublestrike vs one Bulwark', unit('dsb', 6, ['Doublestrike']), 1, 10],
  ])('%s matches resolveClash', (_n, def, sanctums, expected) => {
    const { s, u, foe } = setup(def, sanctums);
    expect(faceHitDamage(s, u)).toBe(expected);
    const before = s.players[foe].vitality;
    expect(declareAttackers(s, [u.iid])).toBe(true);
    declareGuards(s, {});
    resolveClash(s);
    expect(before - s.players[foe].vitality).toBe(expected);
  });
});

describe('declareAttackLabel', () => {
  test('LETHAL follows face damage, not raw Might', () => {
    expect(declareAttackLabel(1, 6, 10, 1)).not.toContain('LETHAL');
    expect(declareAttackLabel(1, 6, 10, 1, 12)).toContain('LETHAL IF UNGUARDED');
  });
});
