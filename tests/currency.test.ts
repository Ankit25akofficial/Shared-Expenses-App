import { test } from 'node:test';
import assert from 'node:assert';
import {
  isValidCurrencyCode,
  convertFloatToSubunits,
  convertSubunitsToFloat,
  formatSubunitToCurrency,
  parseCurrencyToSubunit,
} from '../src/lib/currency.js';

test('Currency Formatting and Validation Utilities Unit Tests', async (t) => {
  await t.test('isValidCurrencyCode: validates supported currency symbols', () => {
    assert.strictEqual(isValidCurrencyCode('INR'), true);
    assert.strictEqual(isValidCurrencyCode('USD'), true);
    assert.strictEqual(isValidCurrencyCode('eur'), true); // case insensitivity check
    assert.strictEqual(isValidCurrencyCode('GBP'), true);
    assert.strictEqual(isValidCurrencyCode('JPY'), false);
    assert.strictEqual(isValidCurrencyCode('CAD'), false);
  });

  await t.test('convertFloatToSubunits: handles precision rounding correctly', () => {
    assert.strictEqual(convertFloatToSubunits(1200.5), 120050n);
    assert.strictEqual(convertFloatToSubunits(899.995), 90000n); // rounds up
    assert.strictEqual(convertFloatToSubunits(0), 0n);
    assert.strictEqual(convertFloatToSubunits(10.254), 1025n); // rounds down
    assert.throws(() => convertFloatToSubunits(NaN), /Invalid numeric input/);
    assert.throws(() => convertFloatToSubunits(Infinity), /Invalid numeric input/);
  });

  await t.test('convertSubunitsToFloat: maps BigInt values back to floats', () => {
    assert.strictEqual(convertSubunitsToFloat(120050n), 1200.5);
    assert.strictEqual(convertSubunitsToFloat(90000n), 900.0);
    assert.strictEqual(convertSubunitsToFloat(0n), 0.0);
  });

  await t.test('formatSubunitToCurrency: generates correct representation strings', () => {
    assert.strictEqual(formatSubunitToCurrency(120050n, 'USD'), '1,200.50');
    assert.strictEqual(formatSubunitToCurrency(90000n, 'INR'), '900.00');
    assert.strictEqual(formatSubunitToCurrency(0n, 'EUR'), '0.00');
  });

  await t.test('parseCurrencyToSubunit: parses varying format strings with robustness', () => {
    assert.strictEqual(parseCurrencyToSubunit('1,200.50'), 120050n);
    assert.strictEqual(parseCurrencyToSubunit('$1,200.50'), 120050n);
    assert.strictEqual(parseCurrencyToSubunit('₹ 899.995'), 90000n);
    assert.strictEqual(parseCurrencyToSubunit(' 450 '), 45000n);
    assert.strictEqual(parseCurrencyToSubunit('0'), 0n);
    assert.throws(() => parseCurrencyToSubunit('abc'), /Failed to parse/);
  });
});
