/**
 * The showroom's camera maths and room selection.
 *
 * These are the parts of the 3D page that can be wrong without looking wrong:
 * a yaw readout that grows without bound after a few spins, a pitch clamp that
 * lets the camera roll over the pole and invert the drag, a FRONT/BACK badge
 * that lies on the second revolution, and — the one the brief names outright —
 * the rarity floor for a special room. A screenshot cannot catch any of them.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POSE,
  MAX_PITCH,
  MAX_ZOOM,
  MIN_ZOOM,
  clampPose,
  displayYaw,
  facingSide,
  isPremiumRarity,
  roomForRarity,
} from './Card3DShowroom';
import { RARITY_ORDER } from '../meta/rarity';

describe('displayYaw', () => {
  it('wraps into 0…359 in both directions', () => {
    expect(displayYaw(0)).toBe(0);
    expect(displayYaw(359)).toBe(359);
    expect(displayYaw(360)).toBe(0);
    // Eleven revolutions of a flick must not read as 3960°.
    expect(displayYaw(3960 + 45)).toBe(45);
    expect(displayYaw(-90)).toBe(270);
    expect(displayYaw(-3960 - 45)).toBe(315);
  });
});

describe('facingSide', () => {
  it('names the side actually pointed at the camera', () => {
    expect(facingSide(0)).toBe('front');
    expect(facingSide(45)).toBe('front');
    expect(facingSide(180)).toBe('back');
    expect(facingSide(200)).toBe('back');
    expect(facingSide(90)).toBe('edge');
    expect(facingSide(270)).toBe('edge');
  });

  it('stays correct after any number of revolutions, either way', () => {
    for (const rev of [-3, -1, 0, 1, 7]) {
      const base = rev * 360;
      expect(facingSide(base)).toBe('front');
      expect(facingSide(base + 180)).toBe('back');
      expect(facingSide(base + 90)).toBe('edge');
    }
  });
});

describe('clampPose', () => {
  it('leaves yaw unbounded — the 360 is the point', () => {
    expect(clampPose({ ...DEFAULT_POSE, yaw: 5000 }).yaw).toBe(5000);
    expect(clampPose({ ...DEFAULT_POSE, yaw: -5000 }).yaw).toBe(-5000);
  });

  it('clamps pitch so the camera never rolls over the pole', () => {
    expect(clampPose({ ...DEFAULT_POSE, pitch: 400 }).pitch).toBe(MAX_PITCH);
    expect(clampPose({ ...DEFAULT_POSE, pitch: -400 }).pitch).toBe(-MAX_PITCH);
    expect(clampPose({ ...DEFAULT_POSE, pitch: 12 }).pitch).toBe(12);
  });

  it('clamps zoom to the readable range', () => {
    expect(clampPose({ ...DEFAULT_POSE, zoom: 99 }).zoom).toBe(MAX_ZOOM);
    expect(clampPose({ ...DEFAULT_POSE, zoom: 0 }).zoom).toBe(MIN_ZOOM);
    expect(clampPose({ ...DEFAULT_POSE, zoom: 1.5 }).zoom).toBe(1.5);
  });
});

describe('rooms', () => {
  it('gives Super-Rare and everything above it a room of its own', () => {
    const premium = ['Super-Rare', 'Ultra-Rare', 'Full-Art', 'Alt-Art', 'Mythic'];
    for (const r of premium) {
      expect(isPremiumRarity(r)).toBe(true);
      expect(roomForRarity(r).premium).toBe(true);
      expect(roomForRarity(r).mood).not.toBe('studio');
      expect(roomForRarity(r).motes).toBeGreaterThan(0);
    }
  });

  it('leaves Common through Rare (and unknown rarities) in the plain studio', () => {
    for (const r of ['Common', 'Uncommon', 'Rare', undefined, 'not-a-rarity']) {
      expect(isPremiumRarity(r)).toBe(false);
      expect(roomForRarity(r).mood).toBe('studio');
      expect(roomForRarity(r).motes).toBe(0);
    }
  });

  it('gives every premium rarity a DISTINCT room, not one shared "special"', () => {
    const moods = RARITY_ORDER.filter(isPremiumRarity).map((r) => roomForRarity(r).mood);
    expect(new Set(moods).size).toBe(moods.length);
  });

  it('agrees with the rarity ladder about where premium starts', () => {
    // The room floor and the ladder must not drift apart: every rarity the
    // ladder puts at or above Super-Rare gets a room, and nothing below does.
    const floor = RARITY_ORDER.indexOf('Super-Rare');
    RARITY_ORDER.forEach((r, i) => {
      expect(isPremiumRarity(r)).toBe(i >= floor);
    });
  });
});
