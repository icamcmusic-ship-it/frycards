import { describe, expect, test } from 'vitest';
import { collectionCsv, csvCell, toCsv } from './csv';

describe('csv', () => {
  test('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(7)).toBe('7');
  });
  test('neutralises spreadsheet formulas in text cells only', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell(-5)).toBe('-5');
  });
  test('rows join with CRLF and end with one', () => {
    expect(toCsv([['a', 1]])).toBe('a,1\r\n');
  });
  test('collectionCsv writes the header and one line per card', () => {
    const out = collectionCsv([
      {
        id: 'x',
        name: 'A, B',
        type: 'Unit',
        rarity: 'Rare',
        set: 'V1',
        quantity: 2,
        foil: 1,
        serialized: 0,
      },
    ]);
    expect(out).toBe(
      'id,name,type,rarity,set,quantity,foil,serialized\r\nx,"A, B",Unit,Rare,V1,2,1,0\r\n',
    );
  });
});
