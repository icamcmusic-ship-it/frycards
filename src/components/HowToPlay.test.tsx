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

import { HowToPlayScreen } from './HowToPlay';
import { MetaContext, MetaState } from '../meta/MetaContext';
import { COACH_DONE_KEY } from '../meta/coachPractice';

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
