import { format } from 'date-fns';

// Generic CSV export utility
export function exportToCSV<T>(
  data: T[],
  columns: { key: string; label: string; format?: (value: unknown, row: T) => string }[],
  filename: string
) {
  if (data.length === 0) {
    throw new Error('No data to export');
  }

  // Build header row
  const headers = columns.map(col => `"${col.label}"`).join(',');
  
  // Build data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value: unknown;
      
      // Handle nested keys like 'candidate.name'
      if (typeof col.key === 'string' && col.key.includes('.')) {
        const keys = col.key.split('.');
        value = keys.reduce((obj: unknown, key) => {
          if (obj && typeof obj === 'object' && key in obj) {
            return (obj as Record<string, unknown>)[key];
          }
          return undefined;
        }, row);
      } else {
        value = (row as Record<string, unknown>)[col.key];
      }
      
      // Apply custom formatter if provided
      if (col.format) {
        value = col.format(value, row);
      }
      
      // Handle null/undefined
      if (value === null || value === undefined) {
        return '""';
      }
      
      // Escape quotes and wrap in quotes
      const stringValue = String(value).replace(/"/g, '""');
      return `"${stringValue}"`;
    }).join(',');
  });
  
  const csv = [headers, ...rows].join('\n');
  downloadFile(csv, `${filename}.csv`, 'text/csv');
}

// Download utility
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Format date for export
export function formatDateForExport(date: string | null | undefined): string {
  if (!date) return '';
  try {
    return format(new Date(date), 'yyyy-MM-dd HH:mm:ss');
  } catch {
    return '';
  }
}

// Format percentage
export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return `${value.toFixed(1)}%`;
}

// Format boolean
export function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value ? 'Yes' : 'No';
}
