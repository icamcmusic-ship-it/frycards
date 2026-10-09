/**
 * @vitest-environment jsdom
 *
 * The match board, mounted: behaviour the pure-helper tests in GameV4.test.ts
 * cannot reach because it lives in handlers and refs — the ⋯ menu that now
 * holds CONCEDE, the sticky INVOKE bar, the PLAY WELLSPRING primary, the
 * end-turn confirm, the single Battle Log drawer and the SKIP-flag reset.
 *
 * Seeds pick who goes first (`firstPlayerForSeed`): 5 gives the human the
 * opening turn, 2 gives it to the CPU.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// E7 needs the CPU's first turn to crash. Everything else is the real AI.
const aiHook = vi.hoisted(() => ({ crashNext: 0, drawOnConcede: false }));
vi.mock('../game/v3/ai', async (importOriginal) => {
  const real = await importOriginal<typeof import('../game/v3/ai')>();
  return {
    ...real,
    playTurn: (...args: Parameters<typeof real.playTurn>) => {
      if (aiHook.crashNext > 0) {
        aiHook.crashNext -= 1;
        throw new Error('boom');
      }
      return real.playTurn(...args);
    },
  };
});

// The engine's draw result (E6) lands on a different branch: until it merges,
// stand in for it so the board's end screen can be pinned today.
vi.mock('../game/v3/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../game/v3/engine')>();
  return {
    ...real,
    concedeGame: (...args: Parameters<typeof real.concedeGame>) => {
      if (aiHook.drawOnConcede) {
        (args[0] as { winner: string | null }).winner = 'draw';
        return;
      }
      return real.concedeGame(...args);
    },
  };
});

import { GameV4 } from './GameV4';
import { buildDeck, randomArchetype } from '../game/v3/decks';
import { mulberry32 } from '../game/v3/engine';
import { resetKeywordIntros } from './CardFaceV4';

function mount(seed: number) {
  const a = randomArchetype(mulberry32(seed));
  const b = randomArchetype(mulberry32(seed * 7919 + 1));
  const onExit = vi.fn();
  const utils = render(
    <GameV4
      humanDeck={buildDeck(a)}
      cpuDeck={buildDeck(b)}
      humanLabel={a.label}
      cpuLabel={b.label}
      playerName="Test"
      seed={seed}
      onExit={onExit}
    />,
  );
  return { ...utils, onExit };
}

/** Past the mulligan, into the first turn the seed deals. */
function keepHand() {
  fireEvent.click(screen.getByText(/KEEP THIS HAND/));
}

beforeEach(() => {
  vi.useFakeTimers();
  aiHook.crashNext = 0;
  aiHook.drawOnConcede = false;
  window.localStorage.clear();
  // Quiet the first-match coach and keyword popovers: not under test here.
  window.localStorage.setItem('frycards_coach_done', '1');
  resetKeywordIntros();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetKeywordIntros();
});

describe('header: CONCEDE lives in the ⋯ menu', () => {
  test('there is no top-level CONCEDE; the menu holds it, behind the existing confirm', () => {
    const { onExit } = mount(5);
    keepHand();
    expect(screen.queryByRole('menuitem')).toBeNull();
    // The mulligan dialog's own concede is gone with the dialog; nothing named
    // CONCEDE is left on the bare board.
    expect(screen.queryByText(/✕ CONCEDE$/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Match menu' }));
    const item = screen.getByRole('menuitem');
    expect(item.textContent).toMatch(/CONCEDE/);
    fireEvent.click(item);

    // The existing confirm still stands between the player and the loss.
    expect(screen.getByText(/Concede this match\?/)).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('CONFIRM'));
    // A resignation is an ordinary ending: it reaches the result screen.
    expect(screen.getByText(/DEFEAT/)).toBeTruthy();
  });

  test('shows the CPU difficulty badge', () => {
    window.localStorage.setItem('frycards:cpu-difficulty', 'hard');
    mount(5);
    keepHand();
    expect(document.querySelector('[data-difficulty="hard"]')?.textContent).toBe('HARD');
  });
});

describe('a drawn match', () => {
  test('shows DRAW — not DEFEAT — when the engine ends it with no winner', () => {
    aiHook.drawOnConcede = true;
    mount(5);
    keepHand();
    fireEvent.click(screen.getByRole('button', { name: 'Match menu' }));
    fireEvent.click(screen.getByRole('menuitem'));
    fireEvent.click(screen.getByText('CONFIRM'));
    expect(screen.getByText('🤝 DRAW')).toBeTruthy();
    expect(screen.queryByText(/DEFEAT|VICTORY/)).toBeNull();
  });
});

describe('turn 1: the Wellspring is the primary move', () => {
  test('PLAY WELLSPRING is the primary and TO CLASH is demoted until it is played', () => {
    mount(5);
    keepHand();
    const primary = document.querySelector<HTMLButtonElement>('button[data-primary="1"]')!;
    expect(primary.textContent).toMatch(/^PLAY \w+ WELLSPRING$/);
    // Moving on is still there, but no longer the primary (Space cannot hit it).
    const toClash = screen.getByRole('button', { name: /^TO CLASH/ });
    expect(toClash.getAttribute('data-primary')).toBeNull();
    // And the label no longer shouts the warning the primary already carries.
    expect(toClash.textContent).not.toMatch(/WELLSPRING UNPLAYED/);

    fireEvent.click(primary);
    const after = document.querySelector<HTMLButtonElement>('button[data-primary="1"]')!;
    expect(after.textContent).toMatch(/^TO CLASH/);
    expect(document.querySelector('[data-location="1"]')).toBeTruthy();
  });
});

describe('hand: tap selects, the sticky bar plays', () => {
  test('a tap selects without playing; INVOKE on the bar plays it', () => {
    mount(5);
    keepHand();
    fireEvent.click(document.querySelector('button[data-primary="1"]')!); // Wellspring first
    const cards = document.querySelectorAll<HTMLElement>('[data-hand-card]');
    const before = cards.length;
    expect(before).toBeGreaterThan(0);

    // Find a card the board says is playable (its bar offers a live INVOKE).
    let played = false;
    for (const card of Array.from(cards)) {
      fireEvent.click(card);
      const bar = document.querySelector<HTMLButtonElement>('[data-invoke-selected="1"]');
      expect(bar).toBeTruthy(); // selecting never plays by itself
      expect(document.querySelectorAll('[data-hand-card]').length).toBe(before);
      if (!bar!.disabled) {
        fireEvent.click(bar!);
        played = true;
        break;
      }
    }
    expect(played).toBe(true);
    // The card left the hand (units/events resolve through the stack, so allow
    // either) — or a target/bond pick opened, which clears the selection.
    expect(document.querySelector('[data-invoke-selected="1"]')).toBeNull();
  });

  test('tapping the selected card again deselects it', () => {
    mount(5);
    keepHand();
    const card = document.querySelector<HTMLElement>('[data-hand-card]')!;
    fireEvent.click(card);
    expect(document.querySelector('[data-invoke-selected="1"]')).toBeTruthy();
    fireEvent.click(card);
    expect(document.querySelector('[data-invoke-selected="1"]')).toBeNull();
  });

  test('double-click is the desktop shortcut and is off on touch', () => {
    mount(5);
    keepHand();
    // jsdom has no `pointer: coarse`, so this is the desktop path: a refused
    // play (no essence yet) must explain itself rather than do nothing.
    const card = document.querySelector<HTMLElement>('[data-hand-card]')!;
    fireEvent.doubleClick(card);
    expect(document.querySelector('[role="alert"], [role="status"]')).toBeTruthy();
    expect(screen.getByText(/double-click plays it/)).toBeTruthy();
  });
});

describe('end turn confirm', () => {
  /** Drive the human through Main I → Clash → Main II. */
  function toMain2() {
    fireEvent.click(document.querySelector('button[data-primary="1"]')!); // PLAY WELLSPRING
    fireEvent.click(screen.getByRole('button', { name: /^TO CLASH/ }));
    fireEvent.click(screen.getByRole('button', { name: /^SKIP TO MAIN II/ }));
  }

  test('asks only when a playable card and essence remain, and can be silenced', () => {
    mount(5);
    keepHand();
    toMain2();
    fireEvent.click(screen.getByRole('button', { name: /^END TURN/ }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm' });
    expect(within(dialog).getByText(/You can still play \d+ card/)).toBeTruthy();
    // Cancelling keeps the player in Main II.
    fireEvent.click(within(dialog).getByText('KEEP PLAYING'));
    expect(screen.queryByRole('dialog', { name: 'Confirm' })).toBeNull();

    // "Don't ask again this match": the next END TURN goes straight through.
    fireEvent.click(screen.getByRole('button', { name: /^END TURN/ }));
    fireEvent.click(screen.getByLabelText(/Don.t ask again this match/));
    fireEvent.click(screen.getByText('END TURN', { selector: 'button' }));
    expect(screen.queryByRole('dialog', { name: 'Confirm' })).toBeNull();
  });
});

describe('Battle Log: one button, one drawer', () => {
  test('RECENT / FULL toggle in a single drawer; the old FULL LOG button is gone', () => {
    mount(5);
    keepHand();
    expect(screen.queryByText(/FULL LOG/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /LOG/ }));
    const drawer = screen.getByRole('region', { name: 'Battle Log' });
    const tabs = within(drawer).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['RECENT', 'FULL']);
    fireEvent.click(within(drawer).getByRole('tab', { name: 'FULL' }));
    expect(within(drawer).getByRole('tab', { name: 'FULL' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});

describe('E7: a SKIP during the think delay does not leak into the next turn', () => {
  test('after a crashed CPU turn recovers, the next narration is not fast-forwarded', () => {
    // Seed 2: the CPU opens. Its first turn will crash.
    aiHook.crashNext = 1;
    mount(2);
    keepHand(); // the CPU's turn starts: "thinking…"
    expect(screen.getByText(/is thinking/)).toBeTruthy();

    // SKIP while it is still thinking: arms the one-shot skip flag and runs the
    // turn now — which crashes, and recovers to the human's turn.
    fireEvent.click(screen.getByRole('button', { name: /^SKIP/ }));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getAllByText(/TURN \d+ · YOU/).length).toBeGreaterThan(0);

    // The human ends their turn; the CPU's NEXT turn narrates for real. With the
    // flag leaked, `narrateBeats` would fast-forward it and no beat counter
    // ("1/N · click ▸▸") would ever render.
    fireEvent.click(screen.getByRole('button', { name: /^TO CLASH/ }));
    fireEvent.click(screen.getByRole('button', { name: /^SKIP TO MAIN II/ }));
    fireEvent.click(screen.getByRole('button', { name: /^END TURN/ }));
    const confirm = screen.queryByRole('dialog', { name: 'Confirm' });
    if (confirm) fireEvent.click(within(confirm).getByText('END TURN'));
    // Going second left the hand over the limit: take the suggested shed.
    const shed = screen.queryByRole('dialog', { name: /Shed down/ });
    if (shed) {
      fireEvent.click(within(shed).getByText(/SUGGEST/));
      fireEvent.click(within(shed).getByText(/SHED & END TURN/));
    }
    act(() => {
      vi.advanceTimersByTime(1000); // just past THINK_MS: the turn is computed, beat 1 is up
    });
    expect(screen.getByText(/click ▸▸/)).toBeTruthy();
  });
});
