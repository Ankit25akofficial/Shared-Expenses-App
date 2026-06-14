import { test } from 'node:test';
import assert from 'node:assert';

interface DebtRelation {
  from: string;
  to: string;
  amount: bigint;
}

/**
 * Pure function executing the same Greedy Netting algorithm used in the balance engine.
 */
function runGreedyNetting(
  members: string[],
  netBalances: { [userId: string]: bigint }
): DebtRelation[] {
  const debtors: { userId: string; net: bigint }[] = [];
  const creditors: { userId: string; net: bigint }[] = [];

  members.forEach((m) => {
    const net = netBalances[m] || 0n;
    if (net < 0n) {
      debtors.push({ userId: m, net });
    } else if (net > 0n) {
      creditors.push({ userId: m, net });
    }
  });

  const simplifiedDebts: DebtRelation[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort((a, b) => (a.net < b.net ? -1 : 1));
    creditors.sort((a, b) => (a.net > b.net ? -1 : 1));

    const debtor = debtors[0];
    const creditor = creditors[0];

    const debtAmount = -debtor.net;
    const creditAmount = creditor.net;
    const settleAmount = debtAmount < creditAmount ? debtAmount : creditAmount;

    simplifiedDebts.push({
      from: debtor.userId,
      to: creditor.userId,
      amount: settleAmount,
    });

    debtor.net += settleAmount;
    creditor.net -= settleAmount;

    if (debtor.net === 0n) debtors.shift();
    if (creditor.net === 0n) creditors.shift();
  }

  return simplifiedDebts;
}

test('Greedy Netting Engine Unit Tests', async (t) => {

  await t.test('Simplifies circular debts (A->B->C->A loop)', () => {
    const members = ['alice', 'bob', 'charlie'];
    
    // Raw debts:
    // Alice owes Bob 100
    // Bob owes Charlie 100
    // Charlie owes Alice 100
    // Netting balances: all should be 0n.
    const netBalances = {
      alice: 0n,
      bob: 0n,
      charlie: 0n,
    };

    const result = runGreedyNetting(members, netBalances);
    assert.strictEqual(result.length, 0); // perfectly cancels out
  });

  await t.test('Simplifies uneven debts chain (Alice -> Bob -> Charlie)', () => {
    const members = ['alice', 'bob', 'charlie'];
    
    // Alice owes Bob 100 (-100 net)
    // Bob owes Charlie 150 (Alice owed Bob 100, Bob paid Charlie 150 -> Bob is owed 50 net)
    // Charlie is owed 150 net
    // Net:
    // Alice: -100
    // Bob: +50
    // Charlie: +50
    const netBalances = {
      alice: -100n,
      bob: 50n,
      charlie: 50n,
    };

    const result = runGreedyNetting(members, netBalances);
    
    // Alice pays Bob 50, Alice pays Charlie 50. Total 2 transactions.
    assert.strictEqual(result.length, 2);
    
    const aliceToBob = result.find(r => r.from === 'alice' && r.to === 'bob')?.amount;
    const aliceToCharlie = result.find(r => r.from === 'alice' && r.to === 'charlie')?.amount;
    
    assert.strictEqual(aliceToBob, 50n);
    assert.strictEqual(aliceToCharlie, 50n);
  });

  await t.test('Simplifies loop with residual debt', () => {
    const members = ['alice', 'bob', 'charlie'];
    
    // Alice owes Bob 100
    // Bob owes Charlie 100
    // Charlie owes Alice 40
    // Net:
    // Alice: -100 + 40 = -60
    // Bob: +100 - 100 = 0
    // Charlie: +100 - 40 = +60
    // Netted Result: Alice owes Charlie 60, Bob is out.
    const netBalances = {
      alice: -60n,
      bob: 0n,
      charlie: 60n,
    };

    const result = runGreedyNetting(members, netBalances);
    
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].from, 'alice');
    assert.strictEqual(result[0].to, 'charlie');
    assert.strictEqual(result[0].amount, 60n);
  });

});
