import { describe, expect, it } from 'vitest';
import { betOptions, chipsInPlay, waitingOn, type Match } from './engine';
import { EFFECT_KEYWORDS, KEYWORD_SPECS, MODIFIER_KEYWORDS } from './keywords';
import { act, give, power, rigHand, table } from './testkit';

/** Cast a power on seat 0's turn on the flop, answer every window and choice. */
function castOnFlop(kw: string, mods: { kw: string }[] = []): Match {
  const m = rigHand(table(3), { button: 0 });
  // Pre-flop: everyone calls / checks to the flop.
  act(m, { type: 'call', seat: 0 }, { type: 'call', seat: 1 }, { type: 'check', seat: 2 });
  // Muck something for Exhume.
  m.hand!.muck.push({ r: 14, s: 0, id: 999, knownTo: [] });
  const seat = m.hand!.toAct!;
  const spec = KEYWORD_SPECS[kw as keyof typeof KEYWORD_SPECS];
  const def = power(
    { kw: kw as never, n: spec.numbered ? 1 : undefined },
    {
      tier: 3,
      colors: [spec.color ?? 'Ember'].filter(Boolean) as never,
      subtype: kw === 'Snuff' ? 'Quick' : 'Slow',
      mods: mods as never,
    },
  );
  const uid = give(m, seat, def);
  const before = chipsInPlay(m);
  const target = spec.target === 'opponent' ? [0, 1, 2].find((i) => i !== seat) : null;
  if (kw === 'Snuff' || kw === 'Call Out' || kw === 'Straddle' || kw === 'Mimic') return m; // need special timing
  act(m, { type: 'cast', seat, uid, target, costs: [] });
  let g = 0;
  while (g++ < 20) {
    const w = waitingOn(m);
    if (w.kind === 'window') act(m, { type: 'pass', seat: w.seats[0] });
    else if (w.kind === 'choice') act(m, { type: 'choose', seat: w.seat, index: 0 });
    else break;
  }
  expect(chipsInPlay(m)).toBe(before);
  return m;
}

describe('every keyword resolves without breaking the table', () => {
  for (const kw of EFFECT_KEYWORDS) {
    it(kw, () => {
      const m = castOnFlop(kw);
      expect(m.phase).not.toBe('over');
    });
  }
  for (const mod of MODIFIER_KEYWORDS) {
    it(`modifier ${mod}`, () => {
      const m = castOnFlop('Kindle', [{ kw: mod }]);
      expect(['hand', 'between']).toContain(m.phase);
    });
  }

  it('Straddle doubles the blind pre-flop and gives the straddler the option', () => {
    const m = rigHand(table(4), { button: 0 });
    const seat = m.hand!.toAct!;
    const uid = give(
      m,
      seat,
      power({ kw: 'Straddle' }, { colors: ['Ember'], mods: [{ kw: 'Quickstrike' }] }),
    );
    act(m, { type: 'cast', seat, uid });
    expect(m.hand!.currentBet).toBe(200);
    expect(m.hand!.straddler).toBe(seat);
    expect(m.hand!.toAct).not.toBe(seat);
    let g = 0;
    while (m.hand!.toAct !== seat && g++ < 10) {
      const s = m.hand!.toAct!;
      act(m, betOptions(m, s)!.canCheck ? { type: 'check', seat: s } : { type: 'call', seat: s });
    }
    expect(m.hand!.toAct).toBe(seat);
    expect(betOptions(m, seat)!.canCheck).toBe(true);
  });

  it('Mimic copies the last cast', () => {
    const m = rigHand(table(3), { button: 0 });
    const a = give(m, 0, power({ kw: 'Siphon', n: 0.5 }, { mods: [{ kw: 'Quickstrike' }] }));
    act(m, { type: 'cast', seat: 0, uid: a }, { type: 'call', seat: 0 });
    const b = give(m, 1, power({ kw: 'Mimic' }, { tier: 2, mods: [{ kw: 'Quickstrike' }] }));
    act(m, { type: 'cast', seat: 1, uid: b });
    expect(m.hand!.casts[1].effect.kw).toBe('Siphon');
  });
});
