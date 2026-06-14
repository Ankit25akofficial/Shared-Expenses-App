/**
 * Utility functions for currency format validation, subunit mapping,
 * and string conversions to eliminate floating point issues.
 */

// Supported currencies in the Shared Expenses system
export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

/**
 * Validates if the given currency code is supported by the application.
 */
export function isValidCurrencyCode(currency: string): boolean {
  return SUPPORTED_CURRENCIES.includes(currency.toUpperCase() as SupportedCurrency);
}

/**
 * Converts float or double numbers (e.g. 899.995 or 1200.5) to a clean BigInt representation in subunits (cents/paise).
 * Employs rounding to prevent precision errors.
 */
export function convertFloatToSubunits(amount: number): bigint {
  if (isNaN(amount) || !isFinite(amount)) {
    throw new Error('Invalid numeric input: amount must be a finite number');
  }
  // Round to nearest integer subunit (2 decimal places)
  return BigInt(Math.round(amount * 100));
}

/**
 * Converts BigInt subunit amount back to standard float number for UI and graph calculations.
 */
export function convertSubunitsToFloat(amount: bigint): number {
  return Number(amount) / 100;
}

/**
 * Formats a BigInt subunit amount to a standard formatted decimal string.
 * E.g., 120000n -> "1200.00" or localized "1,200.00"
 */
export function formatSubunitToCurrency(amount: bigint, currency: string): string {
  const floatVal = convertSubunitsToFloat(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(floatVal);
  return formatted;
}

/**
 * Parses standard currency input strings (e.g. "1,200.50", "899.995", "450") to BigInt subunits.
 * Cleans formatting commas, strips currency signs, and rounds to 2 decimal places.
 */
export function parseCurrencyToSubunit(amountStr: string): bigint {
  // Strip commas, dollar signs, rupee symbols, spaces
  const cleanStr = amountStr.replace(/[$,₹\s]/g, '').replace(/,/g, '');
  const parsedFloat = parseFloat(cleanStr);
  
  if (isNaN(parsedFloat)) {
    throw new Error(`Failed to parse currency string: "${amountStr}"`);
  }
  
  return convertFloatToSubunits(parsedFloat);
}
