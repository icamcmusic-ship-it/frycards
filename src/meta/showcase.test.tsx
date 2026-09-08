/**
 * @vitest-environment jsdom
 *
 * The showcase lock-out, and the guards against it recurring.
 *
 * A live profile was frozen at SHOWCASE FULL (6/6) with no UI path out: four
 * of its six pinned cards had been graded, which moves the copy out of
 * `player_cards`, and `set_showcase_cards` re-validated the ENTIRE array on
 * every write. The array the client sends always contains those four — to
 * pin (`[...showcase, id]`) and to unpin (`showcase.filter(...)`) alike — so
 * every edit threw, including the unpin that would have fixed it.
 *
 * Three things had to hold for that to stop recurring, and each is asserted
 * here: the RPC validates only the delta, divestment prunes the pin, and an
 * unresolvable id renders as something the player can act on instead of as
 * nothing at all.
 */
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { UnavailableShowcaseTile } from './ui';

const MIGRATION = readFileSync(
  'supabase/migrations/20260908000000_showcase_delta_validation_and_hardening.sql',
  'utf8',
);

/** These files quote the code they replaced in their own comments — every
 * "the old shape is gone" assertion below has to read the code, not the
 * prose explaining it. */
const sqlCode = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
const tsCode = (s: string) =>
  s
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

afterEach(cleanup);

describe('set_showcase_cards validates the delta, not the array', () => {
  test('ownership is checked against the added ids only', () => {
    // The whole bug was `card_id = any(v_ids)` — the full array. The fix is
    // that the ownership count runs over `v_added`, so an id already pinned
    // is grandfathered and a removal can never be rejected.
    expect(MIGRATION).toContain('card_id = any(v_added)');
    expect(MIGRATION).toContain('v_owned <> array_length(v_added, 1)');
    // And it must NOT have kept the old whole-array check.
    expect(sqlCode(MIGRATION)).not.toContain('card_id = any(v_ids)');
  });

  test('the added set is exactly the ids not already pinned', () => {
    expect(MIGRATION).toContain('where not (x = any(v_current))');
    expect(MIGRATION).toContain('select coalesce(showcase_cards');
  });

  test('the cap and duplicate guards survive the rewrite', () => {
    expect(MIGRATION).toContain('You can showcase at most 6 cards');
    expect(MIGRATION).toContain('Duplicate cards in showcase');
    expect(MIGRATION).toContain("raise exception 'Not authenticated'");
  });
});

describe('divestment prunes the pin', () => {
  test('a trigger on player_cards fires on the 1 -> 0 transition and on delete', () => {
    expect(MIGRATION).toContain('create trigger prune_showcase_on_divest_upd');
    expect(MIGRATION).toContain('create trigger prune_showcase_on_divest_del');
    expect(MIGRATION).toContain(
      'when (new.quantity + new.foil_quantity <= 0 and old.quantity + old.foil_quantity > 0)',
    );
  });

  test('the trigger only ever removes — pinning stays the player’s call', () => {
    expect(MIGRATION).toContain('array_remove(showcase_cards, v_card)');
    // player_cards is the choke point every divestment path writes through,
    // so one trigger covers grading, quicksell, trade and listing.
    expect(MIGRATION).toContain('after update of quantity, foil_quantity on public.player_cards');
  });

  test('existing stuck profiles are converged by a backfill', () => {
    expect(MIGRATION).toContain('update public.profiles p');
    // Order is preserved and still-held pins are kept — a stuck profile
    // loses only the entries that were already unrenderable.
    expect(MIGRATION).toContain('with ordinality');
    expect(MIGRATION).toContain('array_agg(id order by ord)');
  });
});

describe('an unresolvable showcase id renders as a recoverable tile', () => {
  test('no showcase render site silently drops a missing card', () => {
    for (const path of [
      'src/meta/ProfileScreen.tsx',
      'src/meta/CollectionScreen.tsx',
      'src/meta/PlayerProfileModal.tsx',
    ]) {
      const source = tsCode(readFileSync(path, 'utf8'));
      expect(source).toContain('UnavailableShowcaseTile');
      // The exact line the audit called out: a consumed slot rendering
      // nothing at all.
      expect(source).not.toMatch(/const def = POOL_BY_ID\[id\];\s*\n\s*if \(!def\) return null;/);
    }
  });

  test('the tile names the problem and the offending id', () => {
    render(<UnavailableShowcaseTile cardId="chrysalis_of_the_departed" />);
    expect(screen.getByText('CARD UNAVAILABLE')).toBeTruthy();
    expect(screen.getByText('chrysalis_of_the_departed')).toBeTruthy();
  });

  test('on your own showcase it is the unpin button', async () => {
    const onUnpin = vi.fn();
    render(
      <UnavailableShowcaseTile cardId="familiar_in_the_dark" size="compact" onUnpin={onUnpin} />,
    );
    const button = screen.getByRole('button', {
      name: /Unpin unavailable showcase card familiar_in_the_dark/,
    });
    await userEvent.click(button);
    expect(onUnpin).toHaveBeenCalledTimes(1);
  });

  test('someone else’s profile gets a label, not a button', () => {
    render(<UnavailableShowcaseTile cardId="void_mother" size="compact" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'Card unavailable' })).toBeTruthy();
  });
});

describe('splash progress indicator', () => {
  test('the dead determinate bar is gone, not left reading 0%', () => {
    const source = tsCode(readFileSync('src/App.tsx', 'utf8'));
    // `setProgress` was never called once the boot preload was removed, so
    // `pct` was permanently 0 and the bar never moved.
    expect(source).not.toContain('setProgress');
    expect(source).not.toContain('progress.total');
    expect(source).toContain('splash-indeterminate');
    expect(source).toContain('role="progressbar"');
  });

  test('the sweep stops under reduced motion but the bar stays visible', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toContain('@keyframes splash-indeterminate-kf');
    expect(css).toContain("html[data-motion='reduced'] .splash-indeterminate");
  });
});

describe('backend hardening shipped alongside', () => {
  test('the five economy mutators are no longer callable by anon', () => {
    for (const fn of [
      'crack_graded_slab',
      'quicksell_graded_card',
      'record_match_result',
      'reveal_graded_cards',
      'submit_grading',
    ]) {
      expect(MIGRATION).toMatch(
        new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon;`),
      );
      expect(MIGRATION).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`),
      );
    }
  });

  test('the eight grading helpers the 2026-08-28 pass missed get a pinned search_path', () => {
    const pinned = [...MIGRATION.matchAll(/alter function public\.(grading_\w+)\(/g)].map(
      (m) => m[1],
    );
    expect(new Set(pinned)).toEqual(
      new Set([
        'grading_base_fee',
        'grading_bulk_mult',
        'grading_grade_mult',
        'grading_roll',
        'grading_service_premium',
        'grading_speed_mult',
        'grading_turnaround',
        'grading_voucher_fee',
      ]),
    );
  });

  test('the anti-cheat ledger stays closed to clients', () => {
    // `rls_enabled_no_policy` on match_receipts/match_tickets is the intended
    // posture, not a gap — nothing in the client reads them. Asserted so a
    // future "fix" of the advisor finding does not open the ledger up.
    expect(MIGRATION).toContain('revoke all on public.match_receipts from anon, authenticated;');
    expect(MIGRATION).toContain('revoke all on public.match_tickets  from anon, authenticated;');
    for (const path of ['src/lib/supabase.ts', 'src/meta/MetaContext.tsx']) {
      expect(readFileSync(path, 'utf8')).not.toMatch(/from\(['"]match_(receipts|tickets)['"]\)/);
    }
  });

  test('both storage buckets get a size and MIME ceiling', () => {
    // Uncapped buckets are how 11 MB PNGs reached the CDN and became the
    // cached-egress bill the 2026-09-07 migration cleaned up after.
    expect(MIGRATION).toContain('file_size_limit = 8388608');
    expect(MIGRATION).toContain("where id = 'Card Images'");
    expect(MIGRATION).toContain("where id = 'Other files'");
    expect(MIGRATION).toContain('allowed_mime_types');
  });
});

describe('market-value panel no longer resets state inside its effect', () => {
  test('the synchronous setValue(null) is gone', () => {
    const source = tsCode(readFileSync('src/meta/ui.tsx', 'utf8'));
    expect(source).not.toContain('setValue(null)');
    // Keyed state replaces it: a value fetched for another card is simply
    // unreadable during render, at zero extra render passes.
    expect(source).toContain('state.key === key ? state.value : null');
  });
});
