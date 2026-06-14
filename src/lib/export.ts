/**
 * Utility functions for exporting data from reporting screens to CSV files.
 */

/**
 * Escapes a single CSV field by wrapping it in double quotes if it contains
 * commas, newlines, or double quotes, and escaping existing double quotes.
 */
export function escapeCsvField(value: any): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Converts a 2D array of cells (header + rows) into a CSV string.
 */
export function convertToCsvString(headers: string[], rows: any[][]): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvField).join(','));
  return [headerLine, ...rowLines].join('\n');
}

/**
 * Triggers a browser download of a CSV file.
 * @param csvContent The raw CSV content string
 * @param fileName The name of the file to download (e.g. "report.csv")
 */
export function triggerCsvDownload(csvContent: string, fileName: string): void {
  if (typeof window === 'undefined') return;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Helper to export the Member Ledger report to a CSV file.
 */
export function exportMemberLedgerToCsv(
  userName: string,
  expenses: Array<{
    date: string;
    description: string;
    amount: string;
    currency: string;
    role: string;
    paidAmount: string;
    owedAmount: string;
    netImpact: string;
  }>
): void {
  const headers = [
    'Date',
    'Description',
    'Total Amount',
    'Currency',
    'My Role',
    'Amount I Paid',
    'Amount I Owed',
    'Net Impact'
  ];

  const rows = expenses.map((exp) => [
    exp.date.split('T')[0],
    exp.description,
    exp.amount,
    exp.currency,
    exp.role,
    exp.paidAmount,
    exp.owedAmount,
    exp.netImpact
  ]);

  const csv = convertToCsvString(headers, rows);
  const safeName = userName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  triggerCsvDownload(csv, `member_ledger_${safeName}.csv`);
}

/**
 * Helper to export the Settlement History report to a CSV file.
 */
export function exportSettlementsToCsv(
  settlements: Array<{
    date: string;
    payerName: string;
    payeeName: string;
    amount: string;
    currency: string;
    deletedAt: string | null;
  }>
): void {
  const headers = [
    'Date',
    'Payer',
    'Payee',
    'Amount',
    'Currency',
    'Status'
  ];

  const rows = settlements.map((s) => [
    s.date.split('T')[0],
    s.payerName,
    s.payeeName,
    s.amount,
    s.currency,
    s.deletedAt ? 'Reversed' : 'Active'
  ]);

  const csv = convertToCsvString(headers, rows);
  triggerCsvDownload(csv, `settlement_history.csv`);
}
