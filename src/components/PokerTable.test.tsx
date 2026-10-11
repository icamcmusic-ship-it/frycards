/**
 * @vitest-environment jsdom
 *
 * The poker table's human controls (AUDIT-2026-10-11 §1 A1–A6, A24, §3.1).
 * The engine is fuzzed elsewhere; these pin the table-side contracts a real
 * player hit: a double-click acts once, OFF timers never act for you, a
 * conceded match ignores the hotkeys, the raise slider reaches the exact
 * pot-limit maximum, and nothing opens on hover.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PokerTable, ACT_GUARD_MS } from './PokerTable';
import { POOL_LEADERS } from '../game/poker/cardpool';
import { MODES } from '../game/poker/constants';
import { buildDeck } from '../game/poker/deck';
import { rngOn } from '../game/poker/rng';
import { cpuTableSetup } from '../game/poker/sim';
import { ConfirmHost } from '../meta/confirm';
import { ToastProvider } from '../meta/toast';
import { MetaContext } from '../meta/MetaContext';

function setupFor(seats: number, seed: number) {
  const rng = rngOn({ rng: seed });
  const leader = POOL_LEADERS[seed % POOL_LEADERS.length];
  const deck = buildDeck(leader, MODES.quick, rng, 'Test deck');
  return cpuTableSetup({ seed, mode: 'quick', seats, seat0: { name: 'You', human: true, deck } });
}

function mount(seats = 2, seed = 7) {
  return render(
    <ToastProvider>
      <PokerTable setup={setupFor(seats, seed)} onExit={() => {}} onRematch={() => {}} />
      <ConfirmHost />
    </ToastProvider>,
  );
}

const table = () => screen.getByTestId('poker-table');
const step = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** Run the table until the human owes a decision of `kind` (bet/window/choice). */
function untilHuman(kind = 'bet', budgetMs = 120_000) {
  for (let t = 0; t < budgetMs; t += 50) {
    const w = table().getAttribute('data-waiting') ?? '';
    if (table().getAttribute('data-human-decision') === '1' && w.startsWith(`${kind}:`)) {
      // Past the "just appeared" guard, like a person.
      step(ACT_GUARD_MS + 50);
      return true;
    }
    if (screen.queryByRole('button', { name: /^GOT IT/ }))
      fireEvent.click(screen.getByRole('button', { name: /^GOT IT/ }));
    else if (w.startsWith('window:0') && w === 'window:0') {
      step(ACT_GUARD_MS + 50);
      fireEvent.click(screen.getByRole('button', { name: 'PASS' }));
    } else if (w.startsWith('choice:0')) {
      step(ACT_GUARD_MS + 50);
      const cards = table().querySelectorAll('[data-coach="hole"] button[data-card]');
      if (cards[0]) fireEvent.click(cards[0]);
    } else if (w.startsWith('bet:0') && kind !== 'bet') {
      step(ACT_GUARD_MS + 50);
      fireEvent.keyDown(window, { key: 'c' });
    }
    step(50);
  }
  return false;
}

/** Human action lines in the full log ("You …"). */
function humanLines(): string[] {
  fireEvent.click(screen.getByRole('button', { name: 'Table log' }));
  const lines = Array.from(
    document.querySelectorAll('aside[aria-label="Table log"] div.flex-1 > div'),
  ).map((d) => d.textContent ?? '');
  fireEvent.click(screen.getByRole('button', { name: 'Close log' }));
  return lines.filter((l) => /^You\b/.test(l));
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  localStorage.setItem('frycards_coach_done', '1');
  localStorage.setItem('frycards:cpu-speed', 'INSTANT');
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('once per decision (A2/A3)', () => {
  test('a double-click on CHECK / CALL acts once', () => {
    mount();
    for (let round = 0; round < 4; round++) {
      expect(untilHuman('bet')).toBe(true);
      const before = humanLines().length;
      const btn = screen.getByRole('button', { name: /^(CHECK|CALL)/ });
      // Two clicks a few ms apart — the second lands on whatever re-rendered.
      fireEvent.click(btn);
      step(20);
      const again = screen.queryByRole('button', { name: /^(CHECK|CALL|FOLD)/ });
      if (again) fireEvent.click(again);
      step(5);
      expect(humanLines().length - before).toBe(1);
      if (table().getAttribute('data-waiting') === 'over') break;
    }
  });

  test('the C hotkey pressed twice acts once', () => {
    mount(2, 11);
    expect(untilHuman('bet')).toBe(true);
    const before = humanLines().length;
    fireEvent.keyDown(window, { key: 'c' });
    step(30);
    fireEvent.keyDown(window, { key: 'c' });
    expect(humanLines().length - before).toBe(1);
  });
});

describe('table timers (§3.1)', () => {
  test('OFF never folds or checks for you', () => {
    localStorage.setItem('frycards:timers', 'off');
    mount();
    expect(untilHuman('bet')).toBe(true);
    const waiting = table().getAttribute('data-waiting');
    const before = humanLines().length;
    step(10 * 60_000);
    expect(table().getAttribute('data-waiting')).toBe(waiting);
    expect(humanLines().length).toBe(before);
    // No countdown is shown.
    expect(screen.queryByText(/TIME BANK|^\d+s$/)).toBeNull();
  });

  test('STANDARD auto-acts after the turn timer and the bank', () => {
    mount();
    expect(untilHuman('bet')).toBe(true);
    const before = humanLines().length;
    step(30_000 + 60_000 + 1_000);
    expect(humanLines().length).toBe(before + 1);
  });

  test('the BOTS toggle does not restart the turn timer (A5)', () => {
    mount();
    expect(untilHuman('bet')).toBe(true);
    step(20_000);
    const bots = screen.getByRole('button', { name: /^BOTS/ });
    for (let i = 0; i < 3; i++) fireEvent.click(bots);
    step(300);
    const secs = Number(screen.getByText(/^\d+s$/).textContent!.replace('s', ''));
    expect(secs).toBeLessThanOrEqual(10);
  });

  test('AUTO-DEAL off waits for DEAL NEXT HAND', () => {
    localStorage.setItem('frycards:auto-deal', '0');
    mount();
    expect(untilHuman('bet')).toBe(true);
    fireEvent.keyDown(window, { key: 'f' });
    // Run until the hand is over and the table wants a new one.
    for (let t = 0; t < 30_000 && table().getAttribute('data-waiting') !== 'start'; t += 100)
      step(100);
    expect(table().getAttribute('data-waiting')).toBe('start');
    step(60_000);
    expect(table().getAttribute('data-waiting')).toBe('start');
    fireEvent.click(screen.getAllByRole('button', { name: /NEXT HAND/ })[0]);
    expect(table().getAttribute('data-waiting')).not.toBe('start');
  });
});

describe('raise slider (A6)', () => {
  test('steps by one chip, so the exact maximum is reachable', () => {
    mount(3, 11);
    for (let i = 0; i < 20; i++) {
      expect(untilHuman('bet')).toBe(true);
      const slider = document.querySelector('input[type=range]') as HTMLInputElement | null;
      if (slider) {
        expect(slider.step).toBe('1');
        fireEvent.change(slider, { target: { value: slider.max } });
        expect(screen.getByRole('button', { name: /^(RAISE|BET)/ }).textContent).toContain(
          slider.max,
        );
        return;
      }
      fireEvent.keyDown(window, { key: 'c' });
      step(50);
    }
    throw new Error('never offered a raise');
  });
});

describe('concede (A16/A24)', () => {
  test('after CONCEDE the hotkeys do nothing', async () => {
    mount();
    expect(untilHuman('bet')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'CONCEDE' }));
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    const dialog = screen.getByRole('alertdialog');
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const confirm = buttons[buttons.length - 1];
    expect(confirm).toBeTruthy();
    await act(async () => {
      fireEvent.click(confirm!);
    });
    expect(table().getAttribute('data-waiting')).toBe('over');
    const row = () =>
      screen
        .getAllByRole('listitem')
        .map((li) => li.textContent)
        .join('|');
    const before = row();
    step(ACT_GUARD_MS + 50);
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'f' });
    step(60_000);
    expect(row()).toBe(before);
  });
});

describe('reward floor (A20)', () => {
  test('a result that would beat the server floor is held, then sent once', async () => {
    const onResult = vi.fn();
    render(
      <MetaContext.Provider value={{ session: { user: { id: 'u' } } } as never}>
        <ToastProvider>
          <PokerTable
            setup={setupFor(2, 7)}
            onExit={() => {}}
            onRematch={() => {}}
            onResult={onResult}
          />
          <ConfirmHost />
        </ToastProvider>
      </MetaContext.Provider>,
    );
    expect(untilHuman('bet')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'CONCEDE' }));
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    const buttons = Array.from(screen.getByRole('alertdialog').querySelectorAll('button'));
    await act(async () => {
      fireEvent.click(buttons[buttons.length - 1]);
    });
    step(1000);
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByText(/Reward unlocks in/)).toBeTruthy();
    // Quick heads-up: floor 2 min (+ a margin for the ticket mint).
    step(3 * 60_000);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0]).toMatchObject({ place: 2, seats: 2, mode: 'quick' });
  });
});
