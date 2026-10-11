import { describe, expect, test } from 'vitest';
import { BUYER_PERSONAS, resolvePersona, initials, moodBand } from './personas';
import {
  DIALOGUE,
  MOMENTS,
  buildConversation,
  lineCount,
  momentForEvent,
  pickLine,
} from './dialogue';

describe('CPU buyer dialogue', () => {
  test('at least 16 personas, unique ids and names', () => {
    expect(BUYER_PERSONAS.length).toBeGreaterThanOrEqual(16);
    const names = BUYER_PERSONAS.flatMap((p) => p.names);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(BUYER_PERSONAS.map((p) => p.id)).size).toBe(BUYER_PERSONAS.length);
  });

  test('every persona has every moment, with no empty or unfilled lines', () => {
    for (const p of BUYER_PERSONAS) {
      const bank = DIALOGUE[p.id];
      expect(bank, p.id).toBeTruthy();
      for (const m of MOMENTS) {
        expect(bank[m].length, `${p.id}.${m}`).toBeGreaterThan(0);
        for (const l of bank[m]) {
          expect(l.trim().length).toBeGreaterThan(3);
          expect(l).not.toMatch(/\{(colour|vibe|word)\}/);
        }
      }
    }
    expect(lineCount()).toBeGreaterThanOrEqual(300);
  });

  test('offer-ish lines all name the price', () => {
    for (const p of BUYER_PERSONAS)
      for (const m of ['offer', 'meet_middle', 'final_offer'] as const)
        for (const l of DIALOGUE[p.id][m]) expect(l, `${p.id}.${m}`).toContain('{offer}');
  });

  test('lines are deterministic per seed, and vary across seeds', () => {
    const a = pickLine('kid', 'greet', 1234, 'open');
    expect(pickLine('kid', 'greet', 1234, 'open')).toBe(a);
    const seen = new Set(Array.from({ length: 40 }, (_, i) => pickLine('kid', 'greet', i, 'open')));
    expect(seen.size).toBeGreaterThan(1);
    expect(pickLine('whale', 'offer', 7, 0, { offer: '500' })).toContain('500');
  });

  test('conversation rebuilds from the event log identically', () => {
    const input = {
      persona_id: 'tightfist',
      seed: 99,
      kind: 'buy' as const,
      opening: 100,
      event_log: [
        { e: 'counter', v: 130 },
        { e: 'meet_middle', v: 107 },
        { e: 'final', v: 125 },
        { e: 'walkout' },
      ],
      remark: 'foil' as const,
    };
    const c1 = buildConversation(input);
    expect(buildConversation(input)).toEqual(c1);
    expect(c1.map((l) => l.who)).toEqual(['them', 'them', 'them', 'you', 'them', 'you', 'them']);
    expect(c1[4].text).toContain('107');
  });

  test('every server event maps to a moment', () => {
    for (const e of [
      'arrive',
      'return',
      'bundle',
      'meet_middle',
      'insulted',
      'threat',
      'final_offer',
      'thanks',
      'walkout',
      'declined',
    ])
      expect(momentForEvent(e)).not.toBeNull();
  });

  test('persona lookup by id or by bidder name; helpers', () => {
    expect(resolvePersona('whale')?.archetype).toBe('Whale');
    expect(resolvePersona(null, 'Old Man Brine')?.id).toBe('veteran');
    expect(resolvePersona(null, 'Nobody')).toBeUndefined();
    expect(initials('Captain Tidewell')).toBe('CT');
    expect(moodBand(80).label).toBe('Delighted');
    expect(moodBand(10).label).toBe('Fuming');
  });
});
