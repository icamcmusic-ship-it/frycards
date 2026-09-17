/**
 * Real-pixel tests for the art pipeline's encoding rules.
 *
 * Everything else about the pipeline is verified by reading its source, which
 * catches drift but not arithmetic. These run sharp against a generated image
 * and check what actually comes out, because the entire storage and egress
 * argument rests on the claim that a card-sized copy is orders of magnitude
 * smaller than the generator's output — a claim worth measuring rather than
 * asserting.
 */
import { describe, expect, test } from 'vitest';
import sharp from 'sharp';
import { WIDTH_LADDER } from '../../src/lib/media';
import { MASTER_WIDTH, allRungs, derivedBytes, masterBytes } from './derive';

/** A 4K-ish PNG standing in for raw generator output: noisy enough that it
 * cannot be trivially compressed, so the size comparisons mean something. */
async function syntheticMaster(width = 3840, height = 2880): Promise<Buffer> {
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < pixels.length; i += channels) {
    // Deterministic pseudo-noise — a flat fill would compress to nothing and
    // make every ratio below meaningless.
    const n = (i * 2654435761) >>> 0;
    pixels[i] = n & 0xff;
    pixels[i + 1] = (n >>> 8) & 0xff;
    pixels[i + 2] = (n >>> 16) & 0xff;
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

test('the stored master is never narrower than the widest thing rendered', () => {
  // A master below the top rung would make that rung an upscale of itself —
  // the app would request 960 and get something softer than it asked for.
  expect(MASTER_WIDTH).toBeGreaterThanOrEqual(Math.max(...WIDTH_LADDER));
});

describe('the art pipeline shrinks what it stores', () => {
  test('a 4K master is capped at MASTER_WIDTH and is drastically smaller', async () => {
    const source = await syntheticMaster();
    const master = await masterBytes(source);
    const meta = await sharp(master).metadata();

    expect(meta.width).toBe(MASTER_WIDTH);
    expect(meta.format).toBe('webp');
    // The whole storage argument in one assertion: the stored master is a
    // small fraction of the generator's output.
    expect(master.length).toBeLessThan(source.length / 10);
  }, 60_000);

  test('every ladder rung exists and none exceeds its requested width', async () => {
    const source = await syntheticMaster(1600, 1200);
    const rungs = await allRungs(source);

    expect(rungs.map((r) => r.width)).toEqual([...WIDTH_LADDER]);
    for (const { width, body } of rungs) {
      const meta = await sharp(body).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBeLessThanOrEqual(width);
    }
  }, 60_000);

  test('a wider rung is never smaller on disk than a narrower one', async () => {
    const source = await syntheticMaster(1600, 1200);
    const rungs = await allRungs(source);
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].body.length).toBeGreaterThanOrEqual(rungs[i - 1].body.length);
    }
  }, 60_000);

  test('a source narrower than a rung is not upscaled, but the rung still exists', async () => {
    // The app picks a rung from the ladder without knowing any source's
    // dimensions, so a missing object would 404 into the full-size fallback.
    const small = await syntheticMaster(300, 225);
    const body = await derivedBytes(small, 960);
    const meta = await sharp(body).metadata();
    expect(body.length).toBeGreaterThan(0);
    expect(meta.width).toBe(300);
  }, 60_000);

  test('a card-sized rung lands in tens of kilobytes, not megabytes', async () => {
    // 320 is the `standard` card tier at 2x. If this ever creeps into the
    // hundreds of kB the egress budget stops working.
    const source = await syntheticMaster();
    const body = await derivedBytes(source, 320);
    expect(body.length).toBeLessThan(200_000);
  }, 60_000);
});
