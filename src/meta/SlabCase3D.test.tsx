/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SlabCase3D, shade, turn } from './SlabCase3D';
import { POOL } from '../game/poker/cardpool';
import type { GradedCard } from './grading';

const slab = (grade: number): GradedCard =>
  ({
    id: `t-${grade}`,
    user_id: 'u',
    card_id: POOL[0].id,
    foil: false,
    service: 'tca',
    speed: 'standard',
    fee_paid: 0,
    submitted_at: '2026-01-01T00:00:00Z',
    ready_at: '2026-01-01T00:00:00Z',
    grade,
    revealed_at: '2026-01-01T00:00:00Z',
  }) as GradedCard;

afterEach(cleanup);

describe('SlabCase3D', () => {
  it('turns normals the way the CSS transform does', () => {
    const n = turn([0, 0, 1], 90, 0);
    expect(n[0]).toBeCloseTo(1);
    expect(n[2]).toBeCloseTo(0);
  });

  it('lights the face that faces the key light more than the one facing away', () => {
    expect(shade([0, 0, 1], 0, 0).diff).toBeGreaterThan(shade([0, 0, -1], 0, 0).diff);
    // Turning the case moves the highlight: the front's specular changes.
    expect(shade([0, 0, 1], 0, 0).spec).not.toBeCloseTo(shade([0, 0, 1], 40, 0).spec);
  });

  it('builds a closed case: front, back, well floor, plate and walls on every side', () => {
    const { container } = render(<SlabCase3D g={slab(8)} yaw={0} pitch={0} />);
    const faces = [...container.children] as HTMLElement[];
    // 4 straight walls + 4 corners × 4 facets, plus back, floor, plate, front.
    expect(faces.length).toBe(4 + 16 + 4);
    for (const f of faces) expect(f.style.backfaceVisibility).toBe('hidden');
  });

  it('wraps premium effects round the whole case and damage onto both glasses', () => {
    const gem = render(<SlabCase3D g={slab(10)} yaw={0} pitch={0} />).container;
    expect(gem.querySelectorAll('.slab3d-wall-holo').length).toBe(20);
    expect(gem.querySelectorAll('.slab-ring').length).toBe(2);
    expect(gem.querySelector('.slab3d-halo')).not.toBeNull();
    cleanup();
    const low = render(<SlabCase3D g={slab(5.5)} yaw={0} pitch={0} />).container;
    expect(low.querySelector('.slab3d-wall-holo')).toBeNull();
    // A cracked case: crack paths on the front AND the back glass.
    const cracks = [...low.querySelectorAll('path')].filter(
      (p) => p.getAttribute('stroke') === 'rgba(255,255,255,0.95)',
    );
    expect(cracks.length).toBe(2);
  });
});
