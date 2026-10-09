/**
 * @vitest-environment jsdom
 *
 * The first-game coach is anchored to the element it explains. The placement
 * is pure geometry, so the cases that went wrong on the old fixed `bottom-44`
 * box — a phone, a phone in landscape, an anchor taller than the screen — are
 * pinned here without a browser.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CoachOverlay, SCRIPT, placeCallout, type AvoidRect, type Rect } from './CoachOverlay';
import { COACH_STAGES, REQUIRED_COACH_STAGES } from '../meta/coachPractice';

const intersects = (a: Rect, b: Rect) =>
  Math.min(a.left + a.width, b.left + b.width) > Math.max(a.left, b.left) &&
  Math.min(a.top + a.height, b.top + b.height) > Math.max(a.top, b.top);

const BOX = { w: 360, h: 190 };

function placed(target: Rect | null, vp: { w: number; h: number }, avoid: AvoidRect[] = []) {
  const p = placeCallout(target, BOX, vp, avoid);
  return { ...p, rect: { top: p.top, left: p.left, width: BOX.w, height: BOX.h } };
}

describe('placeCallout', () => {
  test('never covers its target, across phone, tablet, desktop and landscape', () => {
    const viewports = [
      { w: 390, h: 844 },
      { w: 768, h: 1024 },
      { w: 1440, h: 900 },
      { w: 844, h: 390 },
    ];
    for (const vp of viewports) {
      // A full-width lane at a few heights, and a small control.
      for (const top of [60, 300, vp.h - 120]) {
        const lane: Rect = { top, left: 0, width: vp.w, height: 36 };
        const small: Rect = { top, left: vp.w / 2 - 60, width: 120, height: 40 };
        for (const target of [lane, small]) {
          const p = placed(target, vp);
          expect(intersects(p.rect, target), `${vp.w}x${vp.h} @ ${top}: ${p.side}`).toBe(false);
        }
      }
    }
  });

  test('stays inside the viewport', () => {
    for (const vp of [
      { w: 390, h: 844 },
      { w: 844, h: 390 },
    ]) {
      const p = placed({ top: 200, left: 20, width: 100, height: 40 }, vp);
      expect(p.rect.left).toBeGreaterThanOrEqual(0);
      expect(p.rect.top).toBeGreaterThanOrEqual(0);
      expect(p.rect.left + p.rect.width).toBeLessThanOrEqual(vp.w);
      expect(p.rect.top + p.rect.height).toBeLessThanOrEqual(vp.h);
    }
  });

  test('sits right beside a target it has room for', () => {
    const target: Rect = { top: 300, left: 100, width: 160, height: 40 };
    const p = placed(target, { w: 390, h: 844 });
    expect(p.side).toBe('below');
    expect(p.top).toBeGreaterThanOrEqual(target.top + target.height);
  });

  test('steers clear of the primary button when it can', () => {
    // The target is a lane; both "below" and "above" fit, but the board's
    // primary button sits right under where "above" would go.
    const vp = { w: 1440, h: 900 };
    const target: Rect = { top: 520, left: 0, width: 1440, height: 32 };
    const primary: AvoidRect = { top: 360, left: 560, width: 320, height: 48, weight: 40 };
    const p = placed(target, vp, [primary]);
    expect(intersects(p.rect, target)).toBe(false);
    expect(intersects(p.rect, primary)).toBe(false);
  });

  test('landscape: docks to an edge instead of covering the lane it explains', () => {
    const vp = { w: 844, h: 390 };
    const lane: Rect = { top: 150, left: 0, width: 844, height: 40 };
    const p = placed(lane, vp);
    expect(['dock-top', 'dock-bottom']).toContain(p.side);
    expect(intersects(p.rect, lane)).toBe(false);
  });

  test('with no target (its element is off screen) it still lands somewhere safe', () => {
    const p = placed(null, { w: 390, h: 844 });
    expect(p.rect.top).toBeGreaterThanOrEqual(0);
    expect(p.rect.top + BOX.h).toBeLessThanOrEqual(844);
    // The old position, clear of the hand dock.
    expect(p.top + BOX.h).toBeLessThanOrEqual(844 - 100);
  });

  test('a target that fills the screen is still not covered more than necessary', () => {
    const vp = { w: 390, h: 400 };
    const everything: Rect = { top: 0, left: 0, width: 390, height: 400 };
    const p = placed(everything, vp);
    expect(['dock-top', 'dock-bottom']).toContain(p.side);
  });
});

describe('CoachOverlay', () => {
  beforeEach(() => {
    window.localStorage.removeItem('frycards_coach_done');
  });
  afterEach(cleanup);

  test('shows the step for the current stage, once', () => {
    const { rerender } = render(<CoachOverlay stage="hand" />);
    expect(screen.getByRole('dialog').textContent).toMatch(/YOUR HAND/);
    // The table does not have to be mounted: with no anchor on screen the
    // callout still renders (at its fallback spot) rather than throwing.
    rerender(<CoachOverlay stage="bet" />);
    expect(screen.getByRole('dialog').textContent).toMatch(/BETTING/);
    // Back to a stage it already taught: nothing new to say.
    rerender(<CoachOverlay stage="hand" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('teaches poker, one idea per stage, each anchored to its table hook', () => {
    expect(SCRIPT.map((s) => s.stage)).toEqual(COACH_STAGES);
    expect(REQUIRED_COACH_STAGES).toEqual(['hand', 'bet', 'board', 'power']);
    const anchors = Object.fromEntries(SCRIPT.map((s) => [s.stage, s.anchor]));
    expect(anchors).toEqual({
      hand: '[data-coach="hole"]',
      bet: '[data-coach="actions"]',
      board: '[data-coach="board"]',
      power: '[data-coach="powers"]',
      location: '[data-coach="location"]',
      nerve: '[data-coach="leader"]',
    });
    const text = SCRIPT.map((s) => s.body).join(' ');
    for (const word of [
      'straight flush',
      'FOLD',
      'CHECK',
      'CALL',
      'RAISE',
      'pot-limit',
      'flop',
      'turn',
      'river',
      'public',
      'nerve',
    ])
      expect(text).toContain(word);
    expect(text).not.toMatch(/\b(Vitality|Wellspring|Essence|Clash|Dawn|Dusk|Invoke)\b/);
  });

  test('draws a spotlight ring only when its anchor is on screen', () => {
    const { container } = render(<CoachOverlay stage="hand" />);
    expect(container.querySelector('[data-coach-ring]')).toBeNull();
  });

  test('rings the hole cards when the table marks them', () => {
    const hole = document.createElement('div');
    hole.setAttribute('data-coach', 'hole');
    hole.getBoundingClientRect = () =>
      ({
        top: 500,
        left: 300,
        width: 160,
        height: 110,
        right: 460,
        bottom: 610,
        x: 300,
        y: 500,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(hole);
    try {
      const { container } = render(<CoachOverlay stage="hand" />);
      const ring = container.querySelector('[data-coach-ring]') as HTMLElement;
      expect(ring).not.toBeNull();
      expect(ring.style.top).toBe('496px');
    } finally {
      hole.remove();
    }
  });

  test('finishes once the four required ideas are taught, without location or nerve', () => {
    const { rerender } = render(<CoachOverlay stage="hand" />);
    for (const s of ['bet', 'board', 'power']) rerender(<CoachOverlay stage={s} />);
    expect(screen.getByRole('dialog').textContent).toMatch(/POWERS/);
    expect(window.localStorage.getItem('frycards_coach_done')).toBeNull();
    rerender(<CoachOverlay stage="idle" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem('frycards_coach_done')).toBe('1');
  });

  test('optional stages still teach when they come up before the end', () => {
    const { rerender } = render(<CoachOverlay stage="hand" />);
    rerender(<CoachOverlay stage="location" />);
    expect(screen.getByRole('dialog').textContent).toMatch(/LOCATIONS/);
    rerender(<CoachOverlay stage="nerve" />);
    expect(screen.getByRole('dialog').textContent).toMatch(/NERVE/);
    expect(window.localStorage.getItem('frycards_coach_done')).toBeNull();
  });

  test('the final idea offers to finish', () => {
    const { rerender } = render(<CoachOverlay stage="hand" />);
    for (const s of ['bet', 'board', 'power', 'location']) rerender(<CoachOverlay stage={s} />);
    expect(screen.getByRole('button', { name: 'GOT IT' })).toBeTruthy();
    rerender(<CoachOverlay stage="nerve" />);
    screen.getByRole('button', { name: "GOT IT — I'M READY" }).click();
    expect(window.localStorage.getItem('frycards_coach_done')).toBe('1');
  });

  test('"Skip tutorial" ends it for good', () => {
    render(<CoachOverlay stage="hand" />);
    screen.getByText('Skip tutorial').click();
    expect(window.localStorage.getItem('frycards_coach_done')).toBe('1');
  });

  test('a finished coach never shows again', () => {
    window.localStorage.setItem('frycards_coach_done', '1');
    render(<CoachOverlay stage="hand" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
