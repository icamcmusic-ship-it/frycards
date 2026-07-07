/**
 * Vitest wrapper for the engine regression suite ("Rules Bible").
 * The cases live in scripts/engine-tests.ts, which also runs standalone via
 * `npm run test:engine`; importing it executes every assertion and records
 * the outcomes, which we surface here as individual tests.
 */
import { test, expect } from 'vitest';
import { results } from '../../scripts/engine-tests';

test('engine regression suite produced cases', () => {
  expect(results.length).toBeGreaterThan(0);
});

for (const r of results) {
  test(r.name, () => {
    expect(r.pass, r.name).toBe(true);
  });
}
