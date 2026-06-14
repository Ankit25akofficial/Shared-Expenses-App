import { test } from 'node:test';
import assert from 'node:assert';
import { calculateSplits } from '../src/lib/splits.ts';
import { SplitType } from '@prisma/client';

test('Splitting Mechanics Unit Tests', async (t) => {
  
  await t.test('EQUAL: distributes total amount evenly among participants', () => {
    const participants = [
      { userId: 'alice', splitValue: 1 },
      { userId: 'bob', splitValue: 1 },
    ];
    const totalAmount = 1000n; // 10.00
    const result = calculateSplits(totalAmount, SplitType.EQUAL, participants);
    
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result.find(r => r.userId === 'alice')?.owedAmount, 500n);
    assert.strictEqual(result.find(r => r.userId === 'bob')?.owedAmount, 500n);
  });

  await t.test('EQUAL: remainder distributed alphabetically based on userId', () => {
    // 100 paise split 3 ways -> 34 paise for first alphabetically, 33 paise for others
    const participants = [
      { userId: 'charlie', splitValue: 1 },
      { userId: 'alice', splitValue: 1 },
      { userId: 'bob', splitValue: 1 },
    ];
    const totalAmount = 100n; // 1.00
    const result = calculateSplits(totalAmount, SplitType.EQUAL, participants);
    
    assert.strictEqual(result.length, 3);
    
    // Sort orders should be alice, bob, charlie
    const aliceShare = result.find(r => r.userId === 'alice')?.owedAmount;
    const bobShare = result.find(r => r.userId === 'bob')?.owedAmount;
    const charlieShare = result.find(r => r.userId === 'charlie')?.owedAmount;
    
    assert.strictEqual(aliceShare, 34n); // Alice gets the 1-paisa remainder first
    assert.strictEqual(bobShare, 33n);
    assert.strictEqual(charlieShare, 33n);
    
    // Verify sum equals totalAmount
    assert.strictEqual(aliceShare + bobShare + charlieShare, totalAmount);
  });

  await t.test('UNEQUAL: matches user-specified values exactly', () => {
    const participants = [
      { userId: 'alice', splitValue: 650 }, // 6.50
      { userId: 'bob', splitValue: 350 },   // 3.50
    ];
    const totalAmount = 1000n; // 10.00
    const result = calculateSplits(totalAmount, SplitType.UNEQUAL, participants);
    
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result.find(r => r.userId === 'alice')?.owedAmount, 650n);
    assert.strictEqual(result.find(r => r.userId === 'bob')?.owedAmount, 350n);
  });

  await t.test('UNEQUAL: throws error if sum does not equal total amount', () => {
    const participants = [
      { userId: 'alice', splitValue: 600 },
      { userId: 'bob', splitValue: 300 },
    ];
    const totalAmount = 1000n;
    
    assert.throws(() => {
      calculateSplits(totalAmount, SplitType.UNEQUAL, participants);
    }, /does not equal the total expense amount/);
  });

  await t.test('PERCENTAGE: divides total amount based on ratios', () => {
    const participants = [
      { userId: 'alice', splitValue: 60 }, // 60%
      { userId: 'bob', splitValue: 40 },   // 40%
    ];
    const totalAmount = 1000n;
    const result = calculateSplits(totalAmount, SplitType.PERCENTAGE, participants);
    
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result.find(r => r.userId === 'alice')?.owedAmount, 600n);
    assert.strictEqual(result.find(r => r.userId === 'bob')?.owedAmount, 400n);
  });

  await t.test('PERCENTAGE: throws error if sum of percentages does not equal 100%', () => {
    const participants = [
      { userId: 'alice', splitValue: 50 },
      { userId: 'bob', splitValue: 40 },
    ];
    const totalAmount = 1000n;
    
    assert.throws(() => {
      calculateSplits(totalAmount, SplitType.PERCENTAGE, participants);
    }, /percentages.*must equal 100%/);
  });

  await t.test('SHARES: divides amount proportionally by weight', () => {
    const participants = [
      { userId: 'alice', splitValue: 3 }, // 3 shares
      { userId: 'bob', splitValue: 2 },   // 2 shares
      { userId: 'charlie', splitValue: 1 }, // 1 share
    ];
    const totalAmount = 600n; // total 6 shares, each share = 100n
    const result = calculateSplits(totalAmount, SplitType.SHARES, participants);
    
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result.find(r => r.userId === 'alice')?.owedAmount, 300n);
    assert.strictEqual(result.find(r => r.userId === 'bob')?.owedAmount, 200n);
    assert.strictEqual(result.find(r => r.userId === 'charlie')?.owedAmount, 100n);
  });

  await t.test('SHARES: distributes remainders alphabetically when division has remainder', () => {
    const participants = [
      { userId: 'bob', splitValue: 1 },
      { userId: 'alice', splitValue: 1 },
    ];
    const totalAmount = 101n; // 101 / 2 = 50.5
    const result = calculateSplits(totalAmount, SplitType.SHARES, participants);
    
    const aliceShare = result.find(r => r.userId === 'alice')?.owedAmount;
    const bobShare = result.find(r => r.userId === 'bob')?.owedAmount;
    
    assert.strictEqual(aliceShare, 51n); // Alice alphabetically first, gets remainder
    assert.strictEqual(bobShare, 50n);
  });

  await t.test('Edge Cases: empty list or non-positive amount throws error', () => {
    assert.throws(() => {
      calculateSplits(0n, SplitType.EQUAL, [{ userId: 'alice', splitValue: 1 }]);
    }, /amount must be greater than zero/);

    assert.throws(() => {
      calculateSplits(100n, SplitType.EQUAL, []);
    }, /at least one participant/);
  });

});
