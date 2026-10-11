/**
 * Per-seat views (Design Spec v0.1, "Information model").
 *
 * Every seat sees only its own view: its own hole cards (unless blinded by a
 * debuff), the board, public plays, and whatever a power granted it. A cast is
 * public with its full card face, caster and target — except a Veiled target
 * (hidden until the street ends) and a Feint's secret fizzle. The table UI
 * renders from the human's view and every bot receives the same redaction,
 * so difficulty is decision quality, never extra information.
 */
import type { CardDef } from './cards';
import type { Match, PCard, PowerInst } from './engine';

/** A card this seat cannot see. */
export function isHidden(c: Pick<PCard, 'r'>): boolean {
  return c.r === 0;
}

const HIDDEN_CARD = (id: number): PCard => ({ r: 0, s: 0, id, knownTo: [] });

const HIDDEN_DEF: CardDef = { id: '__hidden', name: 'Hidden card', type: 'Event', colors: [] };

function canSee(c: PCard, seat: number, holder: number | null): boolean {
  if (c.public) return true;
  if (holder === seat) return !c.blinded;
  return c.knownTo.includes(seat);
}

function redactCards(cards: PCard[], seat: number, holder: number | null): PCard[] {
  return cards.map((c) => (canSee(c, seat, holder) ? { ...c, knownTo: [] } : HIDDEN_CARD(-1)));
}

function hidePowers(list: PowerInst[]): PowerInst[] {
  return list.map(() => ({ uid: '?', def: HIDDEN_DEF }));
}

/** The match as `seat` may see it. Pure: returns a new object. */
export function viewFor(m: Match, seat: number): Match {
  const v: Match = structuredClone(m);
  v.rng = 0;
  // The seed plus the public action log replays every shuffle, so it would
  // reveal every hole card and the board to come: hidden until the match is
  // over (show a commitment such as a hash of it meanwhile).
  if (m.phase !== 'over') v.seed = 0;
  v.log = m.log.filter((e) => (e.to === undefined || e.to === seat) && !e.hideFrom?.includes(seat));
  v.bag = m.bag.slice(0, 2); // the forecast shows two; the rest of the bag is hidden
  for (const s of v.seats) {
    // Nobody sees any draw pile's order, including their own.
    s.drawPile = hidePowers(s.drawPile);
    if (s.idx !== seat) {
      s.hand = hidePowers(s.hand);
      s.discard = s.discard.map((p) => p); // discards are public
    }
  }
  const h = v.hand;
  if (h) {
    const src = m.hand!;
    h.holes = src.holes.map((cards, holder) => redactCards(cards, seat, holder));
    h.deck = src.deck.map((c) =>
      c.knownTo.includes(seat) ? { ...c, knownTo: [] } : HIDDEN_CARD(-1),
    );
    h.board = src.board.map((c) => (c.facedown ? HIDDEN_CARD(-1) : { ...c, knownTo: [] }));
    h.board2 = src.board2
      ? src.board2.map((c) => (c.facedown ? HIDDEN_CARD(-1) : { ...c, knownTo: [] }))
      : null;
    h.burn = src.burn.map(() => HIDDEN_CARD(-1));
    h.muck = redactCards(src.muck, seat, null);
    // A Veiled cast hides its target until the street ends: the marks it
    // left (hit this street, Locked, poisoned, bountied, entropic) are hidden
    // from every seat but the caster and the target. The engine keeps the
    // real state, so a pick on that seat is refused with "No legal target".
    for (const c of src.casts) {
      if (!c.veiled || c.target === null || c.seat === seat || c.target === seat) continue;
      const t = c.target;
      h.hostileHit[t] = false;
      if (c.effect.kw === 'Lock') h.locked[t] = false;
      const drop = <T extends { from: number; to: number }>(list: T[]): T[] => {
        const k = list.findIndex((x) => x.from === c.seat && x.to === t);
        return k < 0 ? list : list.filter((_, i) => i !== k);
      };
      if (c.effect.kw === 'Venomous') h.venom = drop(h.venom);
      if (c.effect.kw === 'Bounty') h.bounty = drop(h.bounty);
      if (c.effect.kw === 'Entropic') h.entropic = h.entropic.filter((x) => x !== t);
    }
    for (const c of h.casts) {
      if (c.seat !== seat) {
        if (!c.calledOut) c.feinted = false;
        if (c.veiled) c.target = null;
      }
    }
  }
  return v;
}
