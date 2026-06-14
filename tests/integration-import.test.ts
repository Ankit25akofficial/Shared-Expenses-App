import { test } from 'node:test';
import assert from 'node:assert';
import Papa from 'papaparse';

// Helper: Normalize CSV headers to match system fields (reproduced from imports route for test validation)
function mapHeaders(headers: string[]): { [key: string]: string } {
  const mapping: { [key: string]: string } = {};
  
  headers.forEach((h) => {
    const clean = h.trim().toLowerCase();
    
    if (clean.includes('date')) {
      mapping['date'] = h;
    } else if (clean.includes('desc') || clean.includes('item') || clean.includes('details')) {
      mapping['description'] = h;
    } else if (clean.includes('amount') || clean.includes('cost') || clean.includes('value')) {
      mapping['amount'] = h;
    } else if (clean.includes('curr')) {
      mapping['currency'] = h;
    } else if (clean.includes('paid') || clean.includes('payer') || clean.includes('by')) {
      mapping['paidBy'] = h;
    } else if ((clean.includes('split') && clean.includes('type')) || clean.includes('mode') || clean.includes('split_type')) {
      mapping['splitType'] = h;
    } else if (clean.includes('participants') || clean.includes('members') || clean.includes('share') || clean.includes('split details') || clean.includes('splits')) {
      mapping['splits'] = h;
    }
  });

  return mapping;
}

test('CSV Staging & Normalization Integration Tests', async (t) => {

  await t.test('Header Mapping: maps different naming variations to standard fields', () => {
    const headers = ['Trans Date', 'Item Details', 'Cost Value', 'Paid By', 'Division Mode', 'Splits List'];
    const mapping = mapHeaders(headers);
    
    assert.strictEqual(mapping['date'], 'Trans Date');
    assert.strictEqual(mapping['description'], 'Item Details');
    assert.strictEqual(mapping['amount'], 'Cost Value');
    assert.strictEqual(mapping['paidBy'], 'Paid By');
    assert.strictEqual(mapping['splitType'], 'Division Mode');
    assert.strictEqual(mapping['splits'], 'Splits List');
  });

  await t.test('CSV Staging Pipeline: parses and normalizes standard CSV lines', () => {
    const csvContent = `Date,Description,Amount,Paid By,Split Type,Splits\n2026-06-14,Dinner olive,1200,alice@gmail.com,Equal,"alice@gmail.com,bob@gmail.com"`;
    
    const parsed = Papa.parse<any>(csvContent, {
      header: true,
      skipEmptyLines: 'greedy',
    });

    assert.strictEqual(parsed.errors.length, 0);
    assert.strictEqual(parsed.data.length, 1);

    const headers = parsed.meta.fields || [];
    const headerMap = mapHeaders(headers);
    
    // Check missing fields (none should be missing)
    const requiredFields = ['date', 'description', 'amount', 'paidBy'];
    const missing = requiredFields.filter(f => !headerMap[f]);
    assert.strictEqual(missing.length, 0);

    const row = parsed.data[0];
    const rawDate = row[headerMap['date']] || '';
    const rawDesc = row[headerMap['description']] || '';
    const rawAmount = row[headerMap['amount']] || '';
    const rawPaidBy = row[headerMap['paidBy']] || '';
    const rawSplitType = headerMap['splitType'] ? row[headerMap['splitType']] : 'EQUAL';
    const rawSplits = headerMap['splits'] ? row[headerMap['splits']] : '';

    // Normalize
    const parsedDate = new Date(rawDate);
    assert.ok(!isNaN(parsedDate.getTime()));
    const normalizedDate = parsedDate.toISOString();

    let splitTypeEnum = 'EQUAL';
    const cleanSplitType = rawSplitType.trim().toUpperCase();
    if (cleanSplitType.includes('UNEQUAL') || cleanSplitType.includes('EXACT')) {
      splitTypeEnum = 'UNEQUAL';
    }

    const normalizedRow = {
      description: rawDesc.trim(),
      amount: parseFloat(rawAmount) || 0,
      date: normalizedDate,
      payerName: rawPaidBy.trim(),
      splitType: splitTypeEnum,
      splitsRaw: rawSplits.trim(),
    };

    assert.strictEqual(normalizedRow.description, 'Dinner olive');
    assert.strictEqual(normalizedRow.amount, 1200);
    assert.strictEqual(normalizedRow.payerName, 'alice@gmail.com');
    assert.strictEqual(normalizedRow.splitType, 'EQUAL');
    assert.strictEqual(normalizedRow.splitsRaw, 'alice@gmail.com,bob@gmail.com');
  });

  await t.test('CSV Staging Pipeline: fails if required columns are missing', () => {
    const csvContent = `Date,Description,Paid By\n2026-06-14,Dinner,alice@gmail.com`; // missing Amount
    
    const parsed = Papa.parse<any>(csvContent, {
      header: true,
      skipEmptyLines: 'greedy',
    });

    const headers = parsed.meta.fields || [];
    const headerMap = mapHeaders(headers);
    
    const requiredFields = ['date', 'description', 'amount', 'paidBy'];
    const missing = requiredFields.filter(f => !headerMap[f]);
    
    assert.strictEqual(missing.length, 1);
    assert.strictEqual(missing[0], 'amount');
  });

});
