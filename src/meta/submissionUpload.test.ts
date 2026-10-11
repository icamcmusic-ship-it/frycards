import { describe, expect, test } from 'vitest';
import { aspectHint, uploadExt, validateArtFile, validateSubmission } from './submissions';

const MB = 1024 * 1024;

describe('submission art uploads (client mirror of the submission-art bucket)', () => {
  test('type, size and treatment', () => {
    expect(validateArtFile({ type: 'image/png', size: 2 * MB }, 'standard')).toBeNull();
    expect(validateArtFile({ type: 'image/gif', size: MB }, 'standard')).toMatch(/PNG, JPEG/);
    expect(validateArtFile({ type: 'image/webp', size: 9 * MB }, 'standard')).toMatch(/8 MB/);
    expect(validateArtFile({ type: 'video/mp4', size: MB }, 'standard')).toMatch(/video Mythic/);
    expect(validateArtFile({ type: 'image/png', size: MB }, 'video_mythic')).toMatch(/MP4/);
    expect(validateArtFile({ type: 'video/webm', size: MB }, 'video_mythic')).toBeNull();
  });
  test('5:7 aspect hint', () => {
    expect(aspectHint(750, 1050)).toBeNull();
    expect(aspectHint(1904, 2528)).toMatch(/Wider/);
    expect(aspectHint(500, 1000)).toMatch(/Taller/);
  });
  test('an uploaded file replaces the link checks', () => {
    const base = {
      title: 'Ashen Kite',
      type: 'Unit',
      flavor: 'smoke rises',
      imageUrl: '',
    } as const;
    expect(validateSubmission({ ...base, treatment: 'standard' })).toMatch(/https/);
    expect(
      validateSubmission({
        ...base,
        treatment: 'standard',
        artFile: { type: 'image/png', size: MB },
      }),
    ).toBeNull();
    expect(uploadExt('image/jpeg')).toBe('jpg');
  });
});
