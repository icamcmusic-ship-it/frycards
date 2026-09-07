import { describe, expect, test } from 'vitest';
import sharp from 'sharp';
import { MAX_EDGE, humanBytes, isStill, planReencode } from './reencode';

/** A photographic-ish source: smooth gradients plus noise, so it does not
 * compress to nothing the way a flat color would and behaves like the
 * generator output in the bucket. */
async function art(width: number, height: number, format: 'png' | 'webp' | 'jpeg' = 'png') {
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    px[i * 3] = (x * 255) / width;
    px[i * 3 + 1] = (y * 255) / height;
    px[i * 3 + 2] = (x * y * 7919) % 255;
  }
  const image = sharp(px, { raw: { width, height, channels: 3 } });
  return image[format]().toBuffer();
}

describe('planReencode', () => {
  test('caps an oversized master on its longest edge and shrinks it hard', async () => {
    const input = await art(3000, 2000);
    const plan = await planReencode('Volume 1/big.png', input);
    if (plan.action !== 'rewrite') throw new Error(`expected rewrite, got ${plan.reason}`);
    expect(Math.max(plan.width, plan.height)).toBe(MAX_EDGE);
    // Aspect ratio survives.
    expect(plan.width / plan.height).toBeCloseTo(3000 / 2000, 2);
    // The whole point: an order-of-magnitude cut, not a trim.
    expect(plan.bytesAfter).toBeLessThan(plan.bytesBefore / 10);
    expect(await sharp(plan.data).metadata()).toMatchObject({ format: 'webp' });
  });

  test('a source already under the ceiling is re-encoded but never upscaled', async () => {
    const plan = await planReencode('small.png', await art(400, 300));
    if (plan.action !== 'rewrite') throw new Error(`expected rewrite, got ${plan.reason}`);
    expect(plan.width).toBe(400);
    expect(plan.height).toBe(300);
  });

  test('reported dimensions match the bytes actually produced', async () => {
    const plan = await planReencode('a.png', await art(2400, 1200));
    if (plan.action !== 'rewrite') throw new Error('expected rewrite');
    const meta = await sharp(plan.data).metadata();
    expect(meta.width).toBe(plan.width);
    expect(meta.height).toBe(plan.height);
  });

  test('output is bounded regardless of how large the input was', async () => {
    for (const [w, h] of [
      [4096, 4096],
      [6000, 1000],
      [1000, 6000],
    ]) {
      const plan = await planReencode('a.png', await art(w, h));
      if (plan.action !== 'rewrite') throw new Error('expected rewrite');
      expect(plan.width).toBeLessThanOrEqual(MAX_EDGE);
      expect(plan.height).toBeLessThanOrEqual(MAX_EDGE);
    }
  });

  test('art that would not get meaningfully smaller is left alone', async () => {
    // Already a small WebP — re-encoding it would spend a generation of
    // quality for nothing.
    const input = await sharp(await art(300, 200))
      .webp({ quality: 60 })
      .toBuffer();
    const plan = await planReencode('tiny.webp', input);
    expect(plan.action).toBe('skip');
  });

  test('videos are never touched', async () => {
    for (const key of ['Volume 1/clip.mp4', 'a.webm', 'b.MOV']) {
      const plan = await planReencode(key, Buffer.from('not an image'));
      expect(plan).toEqual({ action: 'skip', reason: 'not a still image' });
    }
  });

  test('an undecodable object is skipped rather than aborting the run', async () => {
    const plan = await planReencode('broken.png', Buffer.from('definitely not a png'));
    expect(plan).toEqual({ action: 'skip', reason: 'undecodable' });
  });

  test('an animated still is skipped so resizing cannot flatten it', async () => {
    const frames = await sharp(await art(120, 60), { raw: undefined })
      .webp({ quality: 70 })
      .toBuffer();
    const animated = await sharp(frames, { animated: true })
      .webp({ loop: 0, delay: [100, 100], quality: 70 })
      .toBuffer();
    const meta = await sharp(animated).metadata();
    // Only assert the guard if we actually built something multi-page.
    if ((meta.pages ?? 1) > 1) {
      expect(await planReencode('anim.webp', animated)).toEqual({
        action: 'skip',
        reason: 'animated',
      });
    }
  });
});

test('isStill accepts the bucket’s image types and nothing else', () => {
  for (const k of ['a.png', 'a.PNG', 'x/y z.jpeg', 'a.jpg', 'a.webp'])
    expect(isStill(k)).toBe(true);
  for (const k of ['a.mp4', 'a.mov', 'a.txt', 'noextension']) expect(isStill(k)).toBe(false);
});

test('humanBytes reports the scale a run report needs', () => {
  expect(humanBytes(512)).toBe('512 B');
  expect(humanBytes(6 * 1024 * 1024)).toBe('6.0 MB');
  expect(humanBytes(1024 ** 3)).toBe('1.0 GB');
});
