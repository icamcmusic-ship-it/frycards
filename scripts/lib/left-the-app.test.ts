/**
 * `SIGN IN WITH DISCORD` starts a full-page OAuth redirect, so with egress the
 * document is discord.com by the time the harness reads the body — which it
 * reported as `body text length 0`, the most serious finding it has, twice, on
 * a control working exactly as designed. It never showed up locally because a
 * sandbox with no egress leaves the app page in place; CI has egress and found
 * it on the first run. These pin the distinction.
 */
import { describe, expect, test } from 'vitest';
import { leftTheApp } from './left-the-app';

const BASE = 'http://localhost:3000/meta-preview.html';

describe('leftTheApp', () => {
  test('the preview page itself has not left', () => {
    expect(leftTheApp(BASE, BASE)).toBe(false);
  });

  test('the harness driving its own state is not leaving', () => {
    expect(leftTheApp(`${BASE}?screen=settings`, BASE)).toBe(false);
    expect(leftTheApp(`${BASE}?screen=grading&role=creator`, BASE)).toBe(false);
    expect(leftTheApp(`${BASE}#some-anchor`, BASE)).toBe(false);
  });

  test('an OAuth redirect to another origin has left', () => {
    expect(leftTheApp('https://discord.com/oauth2/authorize?client_id=1', BASE)).toBe(true);
  });

  test('a different page on the same origin has left', () => {
    expect(leftTheApp('http://localhost:3000/board-preview.html', BASE)).toBe(true);
  });

  test('about:blank has left', () => {
    expect(leftTheApp('about:blank', BASE)).toBe(true);
  });

  test('an unparseable current URL is not silently treated as still here', () => {
    expect(leftTheApp('', BASE)).toBe(true);
  });
});
