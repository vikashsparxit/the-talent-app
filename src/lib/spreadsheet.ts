/**
 * Reads the first worksheet of an Excel workbook (.xlsx / .xls) into rows of
 * strings. SheetJS is loaded on demand so it stays out of the main bundle.
 * The dependency is the official SheetJS release (cdn.sheetjs.com); the npm
 * registry "xlsx" package is unmaintained and has known advisories.
 */
export async function readSpreadsheetRows(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const workbook = XLSX.read(bytes, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  return rows.map(row => row.map(cell => (cell == null ? '' : String(cell))));
}
