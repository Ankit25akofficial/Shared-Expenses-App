import prisma from './prisma';

export interface UserLedger {
  userId: string;
  name: string | null;
  email: string;
  totalPaid: number;           // total expenses paid by the user
  totalOwed: number;           // total sum user owes for expenses
  settlementsSent: number;     // total direct payments made by user
  settlementsReceived: number; // total payments received by user
  netBalance: number;          // (totalPaid - totalOwed) + (settlementsSent - settlementsReceived)
  trail: TransactionTrailItem[];
}

export interface TransactionTrailItem {
  id: string;
  type: 'EXPENSE' | 'SETTLEMENT';
  description: string;
  amount: number;         // full expense amount or settlement amount
  personalShare: number;  // user's specific share (owedAmount or settlement amount)
  role: 'PAYER' | 'PARTICIPANT' | 'SENDER' | 'RECEIVER' | 'PAYER_AND_PARTICIPANT';
  date: string;
}

export interface DebtRelation {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface CurrencyBalanceSummary {
  currency: string;
  ledgers: { [userId: string]: UserLedger };
  simplifiedDebts: DebtRelation[];
}

export interface GroupBalancesResult {
  [currency: string]: CurrencyBalanceSummary;
}

/**
 * Calculates explanation ledgers and simplified debts for all members of a group.
 * All math is processed in BigInt subunits (cents/paise) and converted to floating-point numbers at the boundary
 * to prevent IEEE 754 precision issues during arithmetic operations.
 * 
 * Algorithmic steps:
 * 1. Fetch group members, active expenses, and settlements.
 * 2. Initialize a Ledger schema for each participant per currency.
 * 3. Aggregate all paid and owed amounts from expenses, and populate transaction audit trails.
 * 4. Aggregate all sent and received settlements.
 * 5. Compute net balances: Net = (Paid - Owed) + (Sent - Received).
 * 6. Apply the Greedy Netting Debt Simplification Algorithm:
 *    - Split members into Debtors (Net < 0) and Creditors (Net > 0).
 *    - Sort Debtors ascending (most negative first) and Creditors descending (most positive first).
 *    - Match the largest debtor with the largest creditor.
 *    - Clear as much balance as possible: settleAmount = min(|debtor.net|, creditor.net).
 *    - Create simplified debt relation, update balances, and shift users who reach zero net balance.
 *    - Repeat until all debts are simplified.
 * 
 * Complexity:
 * - Sorting is performed on at most N elements (N = number of active group members).
 * - The while-loop runs at most N-1 times (as each iteration resolves at least one member's balance to zero).
 * - Overall Time Complexity: O(N log N) due to sorting in each loop iteration.
 * - Space Complexity: O(N + E + S) where E is expenses and S is settlements to construct the ledger trail.
 * 
 * @param groupId - The UUID of the group to calculate balances for
 * @returns A promise resolving to a CurrencyBalanceSummary map categorized by currency code
 */
export async function calculateGroupBalances(groupId: string): Promise<GroupBalancesResult> {
  // 1. Fetch group members
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: {
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  if (!group) throw new Error('Group not found.');
  const members = group.memberships;

  // 2. Fetch all non-deleted expenses
  const expenses = await prisma.expense.findMany({
    where: { groupId, deletedAt: null },
    include: {
      payer: { select: { id: true, name: true, email: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
  });

  // 3. Fetch all settlements
  const settlements = await prisma.settlement.findMany({
    where: { groupId },
    include: {
      payer: { select: { id: true, name: true, email: true } },
      payee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { date: 'asc' },
  });

  const summary: GroupBalancesResult = {};

  // Helper: Initialize ledger entries for a currency
  const initCurrencyLedger = (currency: string) => {
    if (summary[currency]) return;
    
    summary[currency] = {
      currency,
      ledgers: {},
      simplifiedDebts: [],
    };

    members.forEach(m => {
      summary[currency].ledgers[m.userId] = {
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        totalPaid: 0,
        totalOwed: 0,
        settlementsSent: 0,
        settlementsReceived: 0,
        netBalance: 0,
        trail: [],
      };
    });
  };

  // Helper: Map user ID to display name
  const getUserName = (userId: string): string => {
    const mem = members.find(m => m.userId === userId);
    return mem?.user.name || mem?.user.email || userId;
  };

  // -------------------------------------------------------------
  // A. Aggregate Expenses & Build Trails
  // -------------------------------------------------------------
  for (const exp of expenses) {
    const cur = exp.currency;
    initCurrencyLedger(cur);
    const ledger = summary[cur].ledgers;

    const expAmount = exp.amount; // BigInt
    const payerId = exp.payerId;

    // 1. Record payment for payer
    if (ledger[payerId]) {
      // Temp BigInt arithmetic to prevent float errors
      const centsPaid = BigInt(Math.round(ledger[payerId].totalPaid * 100)) + expAmount;
      ledger[payerId].totalPaid = Number(centsPaid) / 100;
    }

    // 2. Record owed amounts for participants
    for (const part of exp.participants) {
      const partId = part.userId;
      if (ledger[partId]) {
        const centsOwed = BigInt(Math.round(ledger[partId].totalOwed * 100)) + part.owedAmount;
        ledger[partId].totalOwed = Number(centsOwed) / 100;
      }
    }

    // 3. Populate transaction trails
    const involvedUserIds = Array.from(new Set([payerId, ...exp.participants.map(p => p.userId)]));
    
    for (const uid of involvedUserIds) {
      if (!ledger[uid]) continue;

      const isPayer = uid === payerId;
      const partInfo = exp.participants.find(p => p.userId === uid);
      const isPart = !!partInfo;

      let role: TransactionTrailItem['role'] = 'PARTICIPANT';
      let personalShareVal = 0n;

      if (isPayer && isPart) {
        role = 'PAYER_AND_PARTICIPANT';
        personalShareVal = partInfo.owedAmount;
      } else if (isPayer) {
        role = 'PAYER';
        personalShareVal = 0n; // payer paid but doesn't owe anything (non-participant)
      } else if (isPart) {
        role = 'PARTICIPANT';
        personalShareVal = partInfo.owedAmount;
      }

      ledger[uid].trail.push({
        id: exp.id,
        type: 'EXPENSE',
        description: exp.description,
        amount: Number(exp.amount) / 100,
        personalShare: Number(personalShareVal) / 100,
        role,
        date: exp.date.toISOString(),
      });
    }
  }

  // -------------------------------------------------------------
  // B. Aggregate Settlements & Build Trails
  // -------------------------------------------------------------
  for (const set of settlements) {
    const cur = set.currency;
    initCurrencyLedger(cur);
    const ledger = summary[cur].ledgers;

    const setAmount = set.amount;
    const payerId = set.payerId;
    const payeeId = set.payeeId;

    if (ledger[payerId]) {
      const centsSent = BigInt(Math.round(ledger[payerId].settlementsSent * 100)) + setAmount;
      ledger[payerId].settlementsSent = Number(centsSent) / 100;

      ledger[payerId].trail.push({
        id: set.id,
        type: 'SETTLEMENT',
        description: `Settlement sent to ${getUserName(payeeId)}`,
        amount: Number(setAmount) / 100,
        personalShare: Number(setAmount) / 100,
        role: 'SENDER',
        date: set.date.toISOString(),
      });
    }

    if (ledger[payeeId]) {
      const centsRecv = BigInt(Math.round(ledger[payeeId].settlementsReceived * 100)) + setAmount;
      ledger[payeeId].settlementsReceived = Number(centsRecv) / 100;

      ledger[payeeId].trail.push({
        id: set.id,
        type: 'SETTLEMENT',
        description: `Settlement received from ${getUserName(payerId)}`,
        amount: Number(setAmount) / 100,
        personalShare: Number(setAmount) / 100,
        role: 'RECEIVER',
        date: set.date.toISOString(),
      });
    }
  }

  // -------------------------------------------------------------
  // C. Calculate Net Balances & Run Debt Netting per Currency
  // -------------------------------------------------------------
  for (const cur of Object.keys(summary)) {
    const ledgers = summary[cur].ledgers;

    const debtors: { userId: string; net: bigint }[] = [];
    const creditors: { userId: string; net: bigint }[] = [];

    // Calculate net balances in BigInt to prevent float issues
    members.forEach(m => {
      const u = ledgers[m.userId];
      
      const paidCents = BigInt(Math.round(u.totalPaid * 100));
      const owedCents = BigInt(Math.round(u.totalOwed * 100));
      const sentCents = BigInt(Math.round(u.settlementsSent * 100));
      const recvCents = BigInt(Math.round(u.settlementsReceived * 100));

      const netCents = (paidCents - owedCents) + (sentCents - recvCents);
      u.netBalance = Number(netCents) / 100;

      if (netCents < BigInt(0)) {
        debtors.push({ userId: m.userId, net: netCents });
      } else if (netCents > BigInt(0)) {
        creditors.push({ userId: m.userId, net: netCents });
      }
    });

    // Greedy Netting Debt Simplification
    while (debtors.length > 0 && creditors.length > 0) {
      // Sort debtors ascending (most negative first)
      debtors.sort((a, b) => (a.net < b.net ? -1 : 1));
      // Sort creditors descending (most positive first)
      creditors.sort((a, b) => (a.net > b.net ? -1 : 1));

      const debtor = debtors[0];
      const creditor = creditors[0];

      const debtAmount = -debtor.net;
      const creditAmount = creditor.net;
      const settleAmount = debtAmount < creditAmount ? debtAmount : creditAmount;

      summary[cur].simplifiedDebts.push({
        from: debtor.userId,
        fromName: getUserName(debtor.userId),
        to: creditor.userId,
        toName: getUserName(creditor.userId),
        amount: Number(settleAmount) / 100,
      });

      debtor.net += settleAmount;
      creditor.net -= settleAmount;

      if (debtor.net === BigInt(0)) debtors.shift();
      if (creditor.net === BigInt(0)) creditors.shift();
    }
  }

  return summary;
}
