import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { readSpreadsheetRows } from '@/lib/spreadsheet';

function workbookBytes(bookType: 'xlsx' | 'biff8', sheets: Record<string, unknown[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return new Uint8Array(XLSX.write(wb, { bookType, type: 'array' }) as ArrayBuffer);
}

const SAMPLE = [
  ['Name', 'Email', 'Phone', 'Experience'],
  ['Asha Rao', 'asha@example.com', 9876543210, 4.5],
  ['Ravi Kumar', 'ravi@example.com', '', 2],
];

describe('readSpreadsheetRows', () => {
  for (const bookType of ['xlsx', 'biff8'] as const) {
    it(`reads the first sheet of a ${bookType === 'biff8' ? '.xls' : '.xlsx'} file as strings`, async () => {
      const bytes = workbookBytes(bookType, { Candidates: SAMPLE, Other: [['ignored']] });
      const rows = await readSpreadsheetRows(bytes);
      expect(rows).toEqual([
        ['Name', 'Email', 'Phone', 'Experience'],
        ['Asha Rao', 'asha@example.com', '9876543210', '4.5'],
        ['Ravi Kumar', 'ravi@example.com', '', '2'],
      ]);
    });
  }

  it('accepts an ArrayBuffer as FileReader returns it', async () => {
    const bytes = workbookBytes('xlsx', { Sheet1: SAMPLE });
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const rows = await readSpreadsheetRows(buffer);
    expect(rows[1][0]).toBe('Asha Rao');
  });

  it('fills gaps in sparse rows with empty strings', async () => {
    const bytes = workbookBytes('xlsx', { Sheet1: [['A', 'B', 'C'], ['x', null, 'z']] });
    expect(await readSpreadsheetRows(bytes)).toEqual([['A', 'B', 'C'], ['x', '', 'z']]);
  });

  it('does not pollute Object.prototype from header cells', async () => {
    const bytes = workbookBytes('xlsx', { Sheet1: [['__proto__', 'constructor'], ['{"polluted":true}', 'x']] });
    const rows = await readSpreadsheetRows(bytes);
    expect(rows[0]).toEqual(['__proto__', 'constructor']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects data that is not a spreadsheet', async () => {
    const garbage = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02]);
    await expect(readSpreadsheetRows(garbage)).rejects.toThrow();
  });
});
