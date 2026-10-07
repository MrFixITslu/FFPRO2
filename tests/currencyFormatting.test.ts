import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrencyAmount } from '../src/services/currencyService';

test('positive amounts render explicit currency prefixes', () => {
  assert.equal(formatCurrencyAmount(2021, 'XCD', { decimals: 0 }), 'EC$2,021');
  assert.equal(formatCurrencyAmount(2021.5, 'USD', { decimals: 2 }), 'US$2,021.50');
});
test('negative amounts put the sign before the currency, never after', () => {
  assert.equal(formatCurrencyAmount(-2021, 'XCD', { decimals: 0 }), '-EC$2,021');
  assert.equal(formatCurrencyAmount(-12.75, 'USD', { decimals: 2 }), '-US$12.75');
});
test('nonfinite and empty values do not leak NaN into dashboard', () => {
  assert.equal(formatCurrencyAmount(null, 'XCD', { decimals: 0 }), 'EC$0');
  assert.equal(formatCurrencyAmount(Number.NaN, 'USD', { decimals: 2 }), 'US$0.00');
});
test('unit-aware money values keep the sign and ISO code', () => {
  assert.equal(formatCurrencyAmount(-2.5, 'XCD', { decimals: 2, showCode: true }), '-EC$2.50 XCD');
});
