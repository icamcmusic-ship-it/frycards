/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({
  supabase: {},
  fetchCardMarketValue: () => Promise.resolve(null),
}));

import { HAND_RANKS, HowToPlayScreen } from './HowToPlay';
import { MetaContext, MetaState } from '../meta/MetaContext';
import { COACH_DONE_KEY } from '../meta/coachPractice';
import { CATEGORY_NAMES } from '../game/poker/evaluator';
import { KEYWORDS, KEYWORD_SPECS } from '../game/poker/keywords';
import { COLORS } from '../game/poker/colors';
import { LOCATION_TEMPLATES } from '../game/poker/locations';

const render_ = (meta: Partial<MetaState>, onNavigate = vi.fn()) => {
  render(
    <MetaContext.Provider value={{ guest: false, profile: null, ...meta } as unknown as MetaState}>
      <HowToPlayScreen onBack={() => undefined} onNavigate={onNavigate} />
    </MetaContext.Provider>,
  );
  return onNavigate;
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('HowToPlay step cards', () => {
  test('Try it restarts the coach and opens the practice flow', () => {
    localStorage.setItem(COACH_DONE_KEY, '1');
    const onNavigate = render_({ guest: true });
    fireEvent.click(screen.getAllByText(/TRY IT: PRACTICE MATCH/)[0]);
    expect(localStorage.getItem(COACH_DONE_KEY)).toBeNull();
    expect(onNavigate).toHaveBeenCalledWith('play', ['practice']);
  });

  test('a locked account is told practice is coming, not offered a dead button', () => {
    render_({ profile: { role: 'player' } as never });
    expect(screen.queryByText(/TRY IT: PRACTICE MATCH/)).toBeNull();
    expect(screen.getByText(/Practice matches are coming soon/)).toBeTruthy();
    // account screens still link
    expect(screen.getByText(/TRY IT: OPEN DECK BUILDER/)).toBeTruthy();
  });

  test('a guest is not sent to account-only screens', () => {
    render_({ guest: true });
    expect(screen.queryByText(/OPEN DECK BUILDER/)).toBeNull();
    expect(screen.getAllByText('Create an account to unlock.').length).toBeGreaterThan(0);
  });

  test('the coach flag we clear is the one CoachOverlay actually reads', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/CoachOverlay.tsx'), 'utf8');
    expect(src).toContain(`'${COACH_DONE_KEY}'`);
  });
});

/** Open one FULL RULES section by its title and return the rendered rows. */
const openSection = (title: RegExp): HTMLElement => {
  const btn = screen.getByRole('button', { name: title });
  if (btn.getAttribute('aria-expanded') !== 'true') fireEvent.click(btn);
  return btn.parentElement!.querySelector('dl')!;
};

describe('HowToPlay teaches FryCards Poker', () => {
  test('hand ranks run best to worst and match the evaluator', () => {
    expect(HAND_RANKS.map((h) => h.name)).toEqual([...CATEGORY_NAMES].reverse());
    render_({ guest: true });
    const list = screen.getByRole('region', { name: 'Hand ranks' });
    const names = Array.from(list.querySelectorAll('h3')).map((h) => h.textContent);
    expect(names[0]).toBe('Straight flush');
    expect(names[names.length - 1]).toBe('High card');
    expect(names).toHaveLength(9);
  });

  test('the betting round names and pot-limit are explained', () => {
    render_({ guest: true });
    const dl = openSection(/A Hand of Hold'em/);
    for (const term of ['Button & blinds', 'Pre-flop', 'Flop', 'Turn', 'River', 'Showdown']) {
      expect(dl.textContent).toContain(term);
    }
    expect(openSection(/Pot-Limit/).textContent).toMatch(/Side pots/);
  });

  test('the keyword glossary lists every keyword, grouped by colour', () => {
    render_({ guest: true });
    const dl = openSection(/Keywords/);
    const terms = Array.from(dl.querySelectorAll('dt')).map((d) =>
      d.textContent!.replace(/ N$/, ''),
    );
    for (const kw of KEYWORDS) expect(terms).toContain(kw);
    const headings = Array.from(dl.children)
      .filter((el) => el.tagName === 'DIV' && !el.querySelector('dt'))
      .map((el) => el.textContent!);
    expect(headings[0]).toMatch(/Common set/);
    COLORS.forEach((c, i) => expect(headings[i + 1]).toMatch(new RegExp(`^— ${c} —`)));
    // Gated keywords say so.
    const peek = Array.from(dl.querySelectorAll('dt')).find((d) => d.textContent === 'Peek N')!;
    expect(peek.nextElementSibling!.textContent).toMatch(/Only Light cards carry it/);
    expect(KEYWORD_SPECS.Peek.gated).toBe(true);
  });

  test('every Location rule and the Plain Table are listed', () => {
    render_({ guest: true });
    const dl = openSection(/Locations/);
    for (const t of Object.values(LOCATION_TEMPLATES)) expect(dl.textContent).toContain(t.name);
    expect(Object.keys(LOCATION_TEMPLATES)).toHaveLength(18);
  });

  test('rewards are by placement, with the spec numbers', () => {
    render_({ guest: true });
    const dl = openSection(/Rewards/);
    expect(dl.textContent).toContain('1st 100 · 2nd 76 · 3rd 61 · 4th 49 · 5th 43 · 6th 40');
    expect(dl.textContent).toMatch(/Quick ×0\.5 · Standard ×1 · Deep ×1\.5/);
  });

  test('no retired MTG-style rules survive anywhere on the page', () => {
    const { container } = render(
      <MetaContext.Provider value={{ guest: true, profile: null } as unknown as MetaState}>
        <HowToPlayScreen onBack={() => undefined} />
      </MetaContext.Provider>,
    );
    const titles = screen
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('aria-expanded'))
      .map((b) => b.textContent!);
    expect(titles.length).toBeGreaterThan(10);
    const retired =
      /\b(Vitality|Wellsprings?|Essence|Clash|Might|Grit|Mulligan|Dawn|Dusk|Resolve|Invoke|60-card deck)\b/;
    for (const t of titles) {
      fireEvent.click(screen.getByText(t.replace(/[▸▾]$/, '')));
      expect(container.textContent, t).not.toMatch(retired);
    }
  });
});
