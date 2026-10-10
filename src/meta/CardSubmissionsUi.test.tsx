/**
 * @vitest-environment jsdom
 *
 * The Creator's review queue: the poker override editor (star hint, effect
 * keyword limited to the card's colours, modifiers, rules text) feeds the
 * approval payload — the derived `cards` columns are written from the
 * overridden card.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const reviewSubmission = vi.fn(async (_input: Record<string, unknown>) => ({
  data: null,
  error: null,
}));
vi.mock('../lib/supabase', async (orig) => ({
  ...(await orig<typeof import('../lib/supabase')>()),
  fetchMySubmissions: async () => [],
  fetchShowcaseStats: async () => null,
  fetchSubmissionsForReview: async () => [SUB],
  reviewSubmission: (input: Record<string, unknown>) => reviewSubmission(input),
}));

import { MetaContext, type MetaState } from './MetaContext';
import { CardSubmissionsScreen } from './CardSubmissionsScreen';
import { deriveCardMechanics } from '../game/poker/cardpool';
import { effectChoices } from './submissions';
import type { CardSubmissionForReview } from '../lib/supabase';

const SUB: CardSubmissionForReview = {
  id: 'sub-1',
  submitter: 'u2',
  set_name: 'Players Showcase 2026',
  card_name: 'Lantern Choir',
  card_type: 'Unit',
  flavor_text: 'It hums the names of everyone the tide kept.',
  image_url: 'https://cdn.midjourney.com/abc/0_0.png',
  requested_treatment: 'standard',
  status: 'pending',
  review_note: null,
  approved_card_id: null,
  approved_rarity: null,
  created_at: new Date(0).toISOString(),
  reviewed_at: null,
  submitter_username: 'tester',
  submitter_banned: false,
};

afterEach(cleanup);
beforeEach(() => {
  reviewSubmission.mockClear();
  localStorage.clear();
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => undefined;
});

function mount() {
  const meta = {
    session: { user: { id: 'creator' } },
    guest: false,
    setGuest: () => undefined,
    profile: { id: 'creator', username: 'fry', role: 'creator', showcase_cards: [] },
  } as unknown as MetaState;
  return render(
    <MetaContext.Provider value={meta}>
      <CardSubmissionsScreen onBack={() => undefined} />
    </MetaContext.Provider>,
  );
}

const generated = deriveCardMechanics({
  id: 'lantern_choir',
  name: 'Lantern Choir',
  type: 'Unit',
  rarity: 'Common',
  set: SUB.set_name,
  image: SUB.image_url,
  flavor: SUB.flavor_text,
});

describe('Creator review queue — poker override editor', () => {
  test('a star hint is written as overrides.tier and into the mechanics payload', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: 'REVIEW QUEUE' }));
    const stars = (await screen.findByLabelText('stars hint')) as HTMLSelectElement;
    expect(stars.value).toBe(String(generated.tier));
    const hint = generated.tier === 5 ? '1' : '5';
    await user.selectOptions(stars, hint);
    expect(screen.getByText(/OVERRIDDEN: tier/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /APPROVE AS COMMON \(OVERRIDDEN\)/ }));
    await waitFor(() => expect(reviewSubmission).toHaveBeenCalledTimes(1));
    const call = reviewSubmission.mock.calls[0][0] as {
      overrides: Record<string, unknown>;
      mechanics: { might: number; essence_types: string[] };
    };
    expect(call.overrides).toEqual({ tier: Number(hint) });
    expect(call.mechanics.might).toBe(Number(hint));
    expect(call.mechanics.essence_types).toEqual(generated.colors);
  });

  test('the effect select offers only keywords the card’s colours allow', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: 'REVIEW QUEUE' }));
    const effect = (await screen.findByLabelText('effect keyword')) as HTMLSelectElement;
    const offered = [...effect.options].map((o) => o.value);
    expect(offered).toEqual(effectChoices('Unit', generated.colors));
    expect(effect.value).toBe(generated.effect!.kw);
    // No retired MTG term is ever offered.
    expect(offered).not.toContain('Aerial');
  });

  test('approving untouched prints as generated, with no overrides', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: 'REVIEW QUEUE' }));
    await screen.findByLabelText('stars hint');
    expect(screen.getByText(/No overrides — this prints as generated/)).toBeTruthy();
    expect(screen.queryByText(/OVERRIDDEN:/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /^APPROVE AS COMMON$/ }));
    await waitFor(() => expect(reviewSubmission).toHaveBeenCalledTimes(1));
    const call = reviewSubmission.mock.calls[0][0] as {
      overrides: unknown;
      mechanics: { might: number; keywords: string };
    };
    expect(call.overrides).toBeNull();
    expect(call.mechanics.might).toBe(generated.tier);
    expect(call.mechanics.keywords).toBe(generated.keywords!.join(', '));
  });
});
