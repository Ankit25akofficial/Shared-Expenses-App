import { test } from 'node:test';
import assert from 'node:assert';
import { levenshteinDistance, getStringSimilarity } from '../src/lib/anomalies.ts';

test('Anomaly Detection Engine Unit Tests', async (t) => {

  await t.test('levenshteinDistance: computes exact editing distance between strings', () => {
    assert.strictEqual(levenshteinDistance('kitten', 'sitting'), 3);
    assert.strictEqual(levenshteinDistance('priya', 'priya'), 0);
    assert.strictEqual(levenshteinDistance('', 'hello'), 5);
    assert.strictEqual(levenshteinDistance('hello', ''), 5);
    assert.strictEqual(levenshteinDistance('a', 'b'), 1);
  });

  await t.test('getStringSimilarity: handles name variations and computes ratio', () => {
    // Exact matching should be 1.0 (after trim & lowercase)
    assert.strictEqual(getStringSimilarity('Priya ', ' priya'), 1.0);
    
    // Partially spelling variations
    const sim1 = getStringSimilarity('priya', 'Priya S');
    // Levenshtein distance: "priya" to "priya s" is 2 (insert ' ', 's').
    // maxLen = 7. similarity = 1.0 - 2/7 = 5/7 ≈ 0.714
    assert.ok(sim1 > 0.7 && sim1 < 0.75);

    const sim2 = getStringSimilarity('Aisha', 'Aisha Khan');
    // Levenshtein distance: "aisha" to "aisha khan" is 5 (insert ' ', 'k', 'h', 'a', 'n').
    // maxLen = 10. similarity = 1.0 - 5/10 = 0.5
    assert.strictEqual(sim2, 0.5);

    // Completely different strings should have low similarity
    const sim3 = getStringSimilarity('Alice', 'Bob');
    assert.ok(sim3 < 0.2);
  });

});
