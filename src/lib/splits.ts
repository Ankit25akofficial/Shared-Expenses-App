import { SplitType } from '@prisma/client';

interface ParticipantInput {
  userId: string;
  splitValue: number; // raw value input by user (e.g. share count, percentage, or amount)
}

interface CalculatedSplit {
  userId: string;
  owedAmount: bigint;
  splitValue: number;
}

/**
 * Calculates exact integer split liabilities based on split type.
 * All amount inputs and outputs are in integer subunits (paise/cents).
 */
export function calculateSplits(
  totalAmount: bigint,
  splitType: SplitType,
  participants: ParticipantInput[]
): CalculatedSplit[] {
  if (participants.length === 0) {
    throw new Error('An expense must have at least one participant.');
  }
  if (totalAmount <= BigInt(0)) {
    throw new Error('Expense amount must be greater than zero.');
  }

  // Sort participants by userId alphabetically for deterministic remainder distribution
  const sortedParts = [...participants].sort((a, b) => a.userId.localeCompare(b.userId));
  const result: CalculatedSplit[] = [];

  switch (splitType) {
    case SplitType.EQUAL: {
      const count = BigInt(sortedParts.length);
      const baseShare = totalAmount / count;
      const remainder = totalAmount % count;

      for (let i = 0; i < sortedParts.length; i++) {
        const p = sortedParts[i];
        // Distribute remainder paisa-by-paisa to first few participants in alphabetical order
        const owed = baseShare + (BigInt(i) < remainder ? BigInt(1) : BigInt(0));
        result.push({
          userId: p.userId,
          owedAmount: owed,
          splitValue: 1, // equal split values default to 1 (equal share)
        });
      }
      break;
    }

    case SplitType.UNEQUAL: {
      let sumBigInt = BigInt(0);
      for (const p of sortedParts) {
        const valueBigInt = BigInt(Math.round(p.splitValue));
        if (valueBigInt < BigInt(0)) {
          throw new Error('Unequal split amounts cannot be negative.');
        }
        result.push({
          userId: p.userId,
          owedAmount: valueBigInt,
          splitValue: p.splitValue,
        });
        sumBigInt += valueBigInt;
      }

      if (sumBigInt !== totalAmount) {
        throw new Error(`The sum of split amounts (${sumBigInt}) does not equal the total expense amount (${totalAmount}).`);
      }
      break;
    }

    case SplitType.PERCENTAGE: {
      let percentSum = 0;
      let calculatedSum = BigInt(0);

      // 1. Calculate base amounts
      const rawOwed: { userId: string; owed: bigint; splitValue: number }[] = [];
      for (const p of sortedParts) {
        if (p.splitValue < 0) {
          throw new Error('Percentage values cannot be negative.');
        }
        percentSum += p.splitValue;
        
        // Calculate amount in BigInt: (total * percentage) / 100
        const owed = (totalAmount * BigInt(Math.round(p.splitValue * 10000))) / BigInt(1000000);
        
        rawOwed.push({
          userId: p.userId,
          owed,
          splitValue: p.splitValue,
        });
        calculatedSum += owed;
      }

      // Check sum of percentages is close to 100
      if (Math.abs(percentSum - 100) > 0.05) {
        throw new Error(`The sum of split percentages (${percentSum}%) must equal 100%.`);
      }

      // 2. Distribute any integer rounding remainder
      const remainder = totalAmount - calculatedSum;
      
      const step = remainder > BigInt(0) ? BigInt(1) : BigInt(-1);
      let remainderCount = remainder > BigInt(0) ? remainder : -remainder;

      for (let i = 0; i < rawOwed.length; i++) {
        const item = rawOwed[i];
        let adjustment = BigInt(0);
        if (remainderCount > BigInt(0)) {
          adjustment = step;
          remainderCount -= BigInt(1);
        }

        result.push({
          userId: item.userId,
          owedAmount: item.owed + adjustment,
          splitValue: item.splitValue,
        });
      }
      break;
    }

    case SplitType.SHARES: {
      let totalShares = 0;
      for (const p of sortedParts) {
        if (p.splitValue < 0) {
          throw new Error('Share values cannot be negative.');
        }
        totalShares += p.splitValue;
      }

      if (totalShares <= 0) {
        throw new Error('Total shares must be greater than zero.');
      }

      let calculatedSum = BigInt(0);
      const rawOwed: { userId: string; owed: bigint; splitValue: number }[] = [];

      for (const p of sortedParts) {
        const userSharesScaled = BigInt(Math.round(p.splitValue * 10000));
        const totalSharesScaled = BigInt(Math.round(totalShares * 10000));
        
        const owed = (totalAmount * userSharesScaled) / totalSharesScaled;
        rawOwed.push({
          userId: p.userId,
          owed,
          splitValue: p.splitValue,
        });
        calculatedSum += owed;
      }

      // Distribute rounding remainder
      const remainder = totalAmount - calculatedSum;
      const step = remainder > BigInt(0) ? BigInt(1) : BigInt(-1);
      let remainderCount = remainder > BigInt(0) ? remainder : -remainder;

      for (let i = 0; i < rawOwed.length; i++) {
        const item = rawOwed[i];
        let adjustment = BigInt(0);
        if (remainderCount > BigInt(0)) {
          adjustment = step;
          remainderCount -= BigInt(1);
        }

        result.push({
          userId: item.userId,
          owedAmount: item.owed + adjustment,
          splitValue: item.splitValue,
        });
      }
      break;
    }

    default:
      throw new Error(`Unsupported split type`);
  }

  return result;
}
