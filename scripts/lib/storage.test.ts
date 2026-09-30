import { expect, test } from 'vitest';
import { publicUrl } from './storage';

test('publicUrl keeps separators and existing encodings but escapes # and ?', () => {
  expect(publicUrl('a b/c.png')).toMatch(/\/Card%20Images\/a%20b\/c\.png$/);
  expect(publicUrl('x#1.png')).toMatch(/\/x%231\.png$/);
  expect(publicUrl('what?.png')).toMatch(/\/what%3F\.png$/);
  // `:` stays as encodeURI leaves it, so URLs already in the catalog still match.
  expect(publicUrl('a:b.png')).toMatch(/\/a:b\.png$/);
});
