/**
 * The tap-target contract, and the tier rule that makes it satisfiable.
 *
 * v28 ran the project's first tap-target measurement — the thing the mobile
 * roadmap item has named as outstanding since v11 — and it came back with
 * 1,300+ undersized controls, almost all of them one shape: the keyword chips,
 * keyword mentions and cost pips a card face prints. Two things fix that and
 * both can silently come undone, so both are pinned here.
 *
 * 1. Below `full`, those chips are painted rather than pressed. A chip on a
 *    battlefield unit measures 23x14 and sits on top of the card whose own tap
 *    IS the game action (select this attacker, add this card to the deck), so
 *    on a phone the small target stole taps aimed at the big one. A new tier
 *    must make this choice on purpose; the test fails until it does.
 * 2. The `.tap-target` utility still exists and still expands a hit area
 *    without changing what is drawn — it is what carries the genuinely inline
 *    controls elsewhere (a player's name mid-sentence in the Social feed) over
 *    the minimum. A refactor that drops it from the stylesheet takes those
 *    back under with nothing on screen to show it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_SIZES, chipsAreInteractive, type CardSize } from './CardFaceV4';

/** WCAG 2.5.8 (AA) Target Size (Minimum). */
const MIN_TAP_PX = 24;

const ORDER: CardSize[] = ['micro', 'compact', 'standard', 'full'];

describe('card-face chip interactivity ladder', () => {
  it('covers every size the card face can be rendered at', () => {
    expect(new Set(ORDER)).toEqual(new Set(Object.keys(CARD_SIZES) as CardSize[]));
  });

  it('is on at `full` and nowhere else', () => {
    // `full` is the only tier whose chips clear 24x24 unaided, and it is the
    // only tier where they can: every smaller tier clips its chip row and its
    // rules paragraph to a height budget, and a clipping ancestor clips
    // hit-testing too — so a `.tap-target` expansion inside one is a
    // declaration, not a target.
    expect(chipsAreInteractive('micro')).toBe(false);
    expect(chipsAreInteractive('compact')).toBe(false);
    expect(chipsAreInteractive('standard')).toBe(false);
    expect(chipsAreInteractive('full')).toBe(true);
  });

  it('is monotone — once a tier is interactive every larger tier is too', () => {
    // A tier that turned chips back OFF above one that has them ON would mean
    // the rule had stopped being about size, which is the only thing that
    // justifies taking the pointer away from a control at all.
    const flags = ORDER.map(chipsAreInteractive);
    const firstOn = flags.indexOf(true);
    expect(firstOn).toBeGreaterThan(-1);
    expect(flags.slice(firstOn).every(Boolean)).toBe(true);
  });

  it('only turns chips off on tiers whose cards are too small to carry them', () => {
    // The justification for an inert chip is that a 24px target does not fit
    // inside the card without swallowing the card's own tap. Pin that the
    // inert tiers really are the narrow ones: every interactive tier must be
    // wide enough to hold at least two minimum targets side by side.
    for (const size of ORDER) {
      if (!chipsAreInteractive(size)) continue;
      expect(CARD_SIZES[size].w).toBeGreaterThanOrEqual(MIN_TAP_PX * 2);
    }
    // And the converse: the tier that IS interactive must be the largest one,
    // or the rule has stopped being "big enough to press".
    expect(chipsAreInteractive(ORDER[ORDER.length - 1])).toBe(true);
  });
});

describe('.tap-target', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

  it('exists and expands the hit area to the WCAG minimum', () => {
    expect(css).toMatch(/\.tap-target\s*\{/);
    const after = css.slice(css.indexOf('.tap-target::after'));
    const block = after.slice(0, after.indexOf('}'));
    expect(block).toMatch(new RegExp(`min-width:\\s*${MIN_TAP_PX}px`));
    expect(block).toMatch(new RegExp(`min-height:\\s*${MIN_TAP_PX}px`));
  });

  it('expands the target without moving the ink', () => {
    // Absolutely positioned and centred: the pseudo-element must stay out of
    // flow, or every chip it touches grows its painted box and the card
    // layouts these font sizes exist to serve break instead.
    const after = css.slice(css.indexOf('.tap-target::after'));
    const block = after.slice(0, after.indexOf('}'));
    expect(block).toMatch(/position:\s*absolute/);
    expect(block).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
    // And the element itself must establish the containing block, so applying
    // the class alone is always enough.
    const base = css.slice(css.indexOf('.tap-target {'));
    expect(base.slice(0, base.indexOf('}'))).toMatch(/position:\s*relative/);
  });
});

/**
 * The text floor (§2.1 #6): nothing the player has to read goes below 11px.
 *
 * The match board and the coach had ~270 arbitrary `text-[5..10px]` classes
 * between them. They now use the `.fs-*` tokens in index.css, so the sizes in
 * those two files are pinned at zero. The card face is the deliberate
 * exception: it prints miniature faces (micro/compact/standard tiers) whose
 * lettering is part of a card's thumbnail, and the same card is read at size
 * through the hover preview, the inspector and CardReadingPanel. Those
 * literals may not grow — a new one means a decision, not a drive-by.
 */
describe('text size floor', () => {
  const sub11 = (file: string) => {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    return [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)]
      .map((m) => Number(m[1]))
      .filter((px) => px < 11);
  };

  it('keeps the match board on the type tokens', () => {
    expect(sub11('./GameV4.tsx')).toEqual([]);
  });

  it('keeps the coach callout on the type tokens', () => {
    expect(sub11('./CoachOverlay.tsx')).toEqual([]);
  });

  it('does not add to the card face’s miniature-tier exceptions', () => {
    expect(sub11('./CardFaceV4.tsx').length).toBeLessThanOrEqual(28);
  });

  it('defines the tokens the board relies on', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    expect(css).toMatch(/--fs-xs:\s*0\.6875rem/); // 11px
    expect(css).toMatch(/\.fs-xs\s*\{/);
  });
});
