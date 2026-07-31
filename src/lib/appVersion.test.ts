import { describe, expect, it } from 'vitest';
import { updateKind } from './appVersion';

describe('updateKind', () => {
  const base = { build: 'abc123', catalog: '2026-07-31T00:00:00Z' };

  it('reports nothing when both sides match', () => {
    expect(updateKind(base, { ...base })).toBe(null);
  });

  it('reports a build update when the server serves a different bundle', () => {
    expect(updateKind(base, { ...base, build: 'def456' })).toBe('build');
  });

  it('reports a catalog update when the card table moved on', () => {
    expect(updateKind(base, { ...base, catalog: '2026-08-01T12:00:00Z' })).toBe('catalog');
  });

  it('prefers the build update when both changed — one refresh fixes both', () => {
    expect(updateKind(base, { build: 'def456', catalog: '2026-08-01T12:00:00Z' })).toBe('build');
  });

  // The failure mode this guards is a refresh prompt that will not go away: a
  // client that cannot reach the server reads `null`, and `null !== 'abc123'`
  // would otherwise announce an update on every single poll while offline.
  it('never reports an update from a failed check', () => {
    expect(updateKind(base, { build: null, catalog: null })).toBe(null);
    expect(updateKind(base, { build: null, catalog: base.catalog })).toBe(null);
  });

  // The mirror of the above: before the first successful poll the client has no
  // catalog baseline, and comparing against it would fire on the first reading.
  it('never reports an update before a baseline exists', () => {
    expect(updateKind({ build: 'abc123', catalog: null }, { build: 'abc123', catalog: 'x' })).toBe(
      null,
    );
  });
});
