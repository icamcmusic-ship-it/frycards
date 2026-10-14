/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  CHANGELOG_SEEN_KEY,
  ChangelogScreen,
  ENTRIES,
  unseenItemCount,
  unseenVersions,
} from './ChangelogScreen';
import { META_SCREENS } from './routes';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('changelog data', () => {
  test('versions are unique and every item is well-formed', () => {
    const versions = ENTRIES.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (const e of ENTRIES) {
      expect(e.tagline.length).toBeGreaterThan(0);
      for (const it of e.items) {
        expect(it.title.length).toBeGreaterThan(0);
        if (it.route) expect(META_SCREENS).toContain(it.route.screen);
      }
    }
  });
});

describe('last-seen tracking', () => {
  test('a first visit marks only the newest release as new', () => {
    expect([...unseenVersions(null)]).toEqual([ENTRIES[0].version]);
  });
  test('releases after the last-seen version are new', () => {
    expect([...unseenVersions(ENTRIES[2].version)]).toEqual([
      ENTRIES[0].version,
      ENTRIES[1].version,
    ]);
    expect(unseenItemCount(ENTRIES[0].version)).toBe(0);
  });
});

describe('ChangelogScreen', () => {
  test('stickers new items, records the visit and links into the app', () => {
    window.localStorage.setItem(CHANGELOG_SEEN_KEY, ENTRIES[1].version);
    render(<ChangelogScreen onBack={() => undefined} />);
    expect(screen.getAllByText('NEW!')).toHaveLength(ENTRIES[0].items.length);
    expect(window.localStorage.getItem(CHANGELOG_SEEN_KEY)).toBe(ENTRIES[0].version);
    const link = screen.getAllByRole('link', { name: /TRY IT/ })[0];
    expect(link.getAttribute('href')).toMatch(/^#\//);
  });

  test('category filters narrow the list and older releases expand', () => {
    render(<ChangelogScreen onBack={() => undefined} />);
    const collapsed = screen.getAllByRole('button', { expanded: false });
    for (const b of collapsed) fireEvent.click(b);
    expect(collapsed[0].getAttribute('aria-expanded')).toBe('true');

    const before = document.querySelectorAll('.cl-item').length;
    fireEvent.click(screen.getByRole('button', { name: /^Grading/ }));
    const chips = [...document.querySelectorAll('.cl-item .cl-chip')];
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThan(before);
    expect(chips.every((c) => c.getAttribute('data-cat') === 'grading')).toBe(true);
  });
});
