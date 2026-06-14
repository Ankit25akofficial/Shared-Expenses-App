import prisma from './prisma';
import { AnomalySeverity, AnomalyStatus, ImportJobStatus } from '@prisma/client';

// -------------------------------------------------------------
// 1. Text Similarity Algorithms (Levenshtein Distance)
// -------------------------------------------------------------
export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  return dp[m][n];
}

export function getStringSimilarity(s1: string, s2: string): number {
  const clean1 = s1.trim().toLowerCase();
  const clean2 = s2.trim().toLowerCase();
  if (clean1 === clean2) return 1.0;
  const maxLen = Math.max(clean1.length, clean2.length);
  if (maxLen === 0) return 0.0;
  const dist = levenshteinDistance(clean1, clean2);
  return 1.0 - dist / maxLen;
}

// Helper: Parse comma-separated splits text
interface ParsedParticipant {
  name: string;
  value: number;
}

function parseSplitsText(splitsRaw: string): ParsedParticipant[] {
  if (!splitsRaw.trim()) return [];
  
  return splitsRaw.split(',').map(entry => {
    const parts = entry.split(':');
    const name = parts[0].trim();
    // Default value is 1 (e.g. for Equal names list or 1 share)
    const val = parts[1] ? parseFloat(parts[1].trim()) : 1;
    return { name, value: isNaN(val) ? 0 : val };
  });
}

// -------------------------------------------------------------
// 2. Anomaly Detection Engine Entry Point
// -------------------------------------------------------------
export async function runAnomalyDetection(jobId: string, groupId: string) {
  // 1. Fetch Job and staged rows
  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: {
      rows: true,
    },
  });

  if (!job) throw new Error('Import job not found.');

  // Delete any pre-existing anomalies for this job to allow clean re-runs
  await prisma.importAnomaly.deleteMany({
    where: { jobId },
  });

  // 2. Fetch Group properties and active membership records for references
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: {
        include: {
          user: true,
        },
      },
      expenses: {
        where: { deletedAt: null },
        include: {
          participants: true,
        },
      },
    },
  });

  if (!group) throw new Error('Group not found.');

  const members = group.memberships;
  let anomaliesFoundCount = 0;

  // 3. Loop through and evaluate each row
  for (const row of job.rows) {
    const raw = row.rawData as any;
    const exp = row.normalizedExpense as any;
    if (!exp) continue;

    const rowAnomalies: {
      type: string;
      severity: AnomalySeverity;
      message: string;
      originalValue: string | null;
      suggestedFix: string | null;
    }[] = [];

    // Extract values
    const desc = exp.description;
    const amount = exp.amount;
    const currency = exp.currency;
    const dateStr = exp.date;
    const payerName = exp.payerName;
    const splitType = exp.splitType;
    const splitsRaw = exp.splitsRaw;

    const parsedDate = dateStr ? new Date(dateStr) : null;

    // --- RULE 1: Precision Issues ---
    // Check if the amount has more than 2 decimal places
    const amountStr = amount.toString();
    const decimalParts = amountStr.split('.');
    if (decimalParts[1] && decimalParts[1].length > 2) {
      rowAnomalies.push({
        type: 'ANOM_PREC',
        severity: AnomalySeverity.LOW,
        message: `Amount (${amount}) contains more than 2 decimal places.`,
        originalValue: amountStr,
        suggestedFix: `Round amount to 2 decimal places (${parseFloat(amount.toFixed(2))}).`,
      });
    }

    // --- RULE 2: Negative Amounts ---
    if (amount <= 0) {
      rowAnomalies.push({
        type: 'ANOM_NEG',
        severity: AnomalySeverity.HIGH,
        message: 'Expense amount must be greater than zero.',
        originalValue: amount.toString(),
        suggestedFix: 'Convert amount to positive value or skip this row.',
      });
    }

    // --- RULE 3: Date Format Issues ---
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      rowAnomalies.push({
        type: 'ANOM_DATE',
        severity: AnomalySeverity.HIGH,
        message: 'Expense date is missing or malformed.',
        originalValue: raw.Date || raw.date || null,
        suggestedFix: 'Select a valid calendar date manually.',
      });
    }

    // --- RULE 4: Missing Paid By ---
    if (!payerName) {
      rowAnomalies.push({
        type: 'ANOM_MISS_PAY',
        severity: AnomalySeverity.HIGH,
        message: 'Payer field is empty.',
        originalValue: null,
        suggestedFix: 'Select a member from the group roster to set as payer.',
      });
    }

    // --- RULE 5: Currency Outliers ---
    if (currency === 'USD' && amount > 10000) {
      rowAnomalies.push({
        type: 'ANOM_OUT',
        severity: AnomalySeverity.HIGH,
        message: `Suspiciously large USD expense: $${amount}.`,
        originalValue: amount.toString(),
        suggestedFix: 'Please verify that this outlier amount is correct.',
      });
    } else if (currency === 'INR' && amount > 1000000) {
      rowAnomalies.push({
        type: 'ANOM_OUT',
        severity: AnomalySeverity.HIGH,
        message: `Suspiciously large INR expense: ₹${amount}.`,
        originalValue: amount.toString(),
        suggestedFix: 'Please verify that this outlier amount is correct.',
      });
    }

    // --- RULE 6: Multiple Currencies ---
    if (currency !== group.defaultCurrency) {
      rowAnomalies.push({
        type: 'ANOM_CURR',
        severity: AnomalySeverity.LOW,
        message: `Expense currency (${currency}) does not match the Group base currency (${group.defaultCurrency}).`,
        originalValue: currency,
        suggestedFix: `Approve to convert using historical exchange rate.`,
      });
    }

    // --- RULE 7: Settlement Disguised as Expense ---
    const lowerDesc = desc.toLowerCase();
    const settlementKeywords = ['settle', 'paid back', 'reimburse', 'payment to', 'transfer', 'sent money'];
    const matchesKeyword = settlementKeywords.some(keyword => lowerDesc.includes(keyword));
    if (matchesKeyword) {
      rowAnomalies.push({
        type: 'ANOM_SETTLE',
        severity: AnomalySeverity.MEDIUM,
        message: `Description "${desc}" suggests this may be a settlement payment, not a shared expense.`,
        originalValue: desc,
        suggestedFix: 'Verify split details or skip if this was a direct peer payment.',
      });
    }

    // --- Identity Matching (Name Variations & Unknown Participants) ---
    let resolvedPayerId: string | undefined = undefined;

    if (payerName) {
      // Look for exact match
      const exactPayer = members.find(
        m => m.user.name?.toLowerCase() === payerName.toLowerCase() || 
             m.user.email.toLowerCase() === payerName.toLowerCase()
      );

      if (exactPayer) {
        resolvedPayerId = exactPayer.userId;
      } else {
        // Run fuzzy match against members
        let bestMatch: typeof members[0] | null = null;
        let bestScore = 0;

        for (const m of members) {
          const scoreByName = m.user.name ? getStringSimilarity(payerName, m.user.name) : 0;
          const scoreByEmail = getStringSimilarity(payerName, m.user.email.split('@')[0]);
          const maxScore = Math.max(scoreByName, scoreByEmail);
          
          if (maxScore > bestScore) {
            bestScore = maxScore;
            bestMatch = m;
          }
        }

        // --- RULE 8: Name Variations ---
        if (bestScore >= 0.70 && bestScore < 1.0 && bestMatch) {
          resolvedPayerId = bestMatch.userId;
          rowAnomalies.push({
            type: 'ANOM_NAME',
            severity: AnomalySeverity.MEDIUM,
            message: `Payer name "${payerName}" resembles group member "${bestMatch.user.name || bestMatch.user.email}".`,
            originalValue: payerName,
            suggestedFix: `Map identity to group member "${bestMatch.user.name || bestMatch.user.email}".`,
          });
        } 
        // --- RULE 9: Unknown Participant ---
        else {
          rowAnomalies.push({
            type: 'ANOM_UNK',
            severity: AnomalySeverity.HIGH,
            message: `Payer "${payerName}" cannot be matched to any registered group member.`,
            originalValue: payerName,
            suggestedFix: 'Add this user to the group roster or map to an existing member.',
          });
        }
      }
    }

    // Parse participant list
    const parsedParticipants = parseSplitsText(splitsRaw);
    const resolvedParticipants: { userId: string; splitValue: number }[] = [];

    if (parsedParticipants.length > 0) {
      for (const p of parsedParticipants) {
        const exactPart = members.find(
          m => m.user.name?.toLowerCase() === p.name.toLowerCase() || 
               m.user.email.toLowerCase() === p.name.toLowerCase()
        );

        if (exactPart) {
          resolvedParticipants.push({ userId: exactPart.userId, splitValue: p.value });
        } else {
          let bestMatch: typeof members[0] | null = null;
          let bestScore = 0;

          for (const m of members) {
            const scoreByName = m.user.name ? getStringSimilarity(p.name, m.user.name) : 0;
            const scoreByEmail = getStringSimilarity(p.name, m.user.email.split('@')[0]);
            const maxScore = Math.max(scoreByName, scoreByEmail);
            
            if (maxScore > bestScore) {
              bestScore = maxScore;
              bestMatch = m;
            }
          }

          if (bestScore >= 0.70 && bestScore < 1.0 && bestMatch) {
            resolvedParticipants.push({ userId: bestMatch.userId, splitValue: p.value });
            rowAnomalies.push({
              type: 'ANOM_NAME',
              severity: AnomalySeverity.MEDIUM,
              message: `Participant name "${p.name}" resembles group member "${bestMatch.user.name || bestMatch.user.email}".`,
              originalValue: p.name,
              suggestedFix: `Map identity to group member "${bestMatch.user.name || bestMatch.user.email}".`,
            });
          } else {
            rowAnomalies.push({
              type: 'ANOM_UNK',
              severity: AnomalySeverity.HIGH,
              message: `Participant "${p.name}" cannot be matched to any registered group member.`,
              originalValue: p.name,
              suggestedFix: 'Register this member in the group or map to an existing member.',
            });
          }
        }
      }
    } else {
      // Default: Equal split among all active members on the date
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        const checkDay = parsedDate.toISOString().split('T')[0];
        const activeMembers = members.filter(m => {
          const joinDay = new Date(m.joinedAt).toISOString().split('T')[0];
          const leaveDay = m.leftAt ? new Date(m.leftAt).toISOString().split('T')[0] : null;
          return joinDay <= checkDay && (leaveDay === null || leaveDay >= checkDay);
        });
        activeMembers.forEach(m => {
          resolvedParticipants.push({ userId: m.userId, splitValue: 1 });
        });
      } else {
        // Fallback to all group members
        members.forEach(m => {
          resolvedParticipants.push({ userId: m.userId, splitValue: 1 });
        });
      }
    }

    // Update normalizedExpense with resolved payer and participants
    exp.payerId = resolvedPayerId;
    exp.participants = resolvedParticipants;

    // --- RULE 10: Invalid Split Details ---
    if (resolvedParticipants.length > 0) {
      if (splitType === 'PERCENTAGE') {
        const pctSum = resolvedParticipants.reduce((sum, p) => sum + p.splitValue, 0);
        if (Math.abs(pctSum - 100) > 0.5) {
          rowAnomalies.push({
            type: 'ANOM_SPLIT',
            severity: AnomalySeverity.HIGH,
            message: `Split percentages must sum to 100%. Found: ${pctSum}%.`,
            originalValue: splitsRaw,
            suggestedFix: 'Distribute split percentages to sum exactly to 100%.',
          });
        }
      } else if (splitType === 'SHARES') {
        const shareSum = resolvedParticipants.reduce((sum, p) => sum + p.splitValue, 0);
        if (shareSum <= 0) {
          rowAnomalies.push({
            type: 'ANOM_SPLIT',
            severity: AnomalySeverity.HIGH,
            message: 'Total shares weights must be greater than zero.',
            originalValue: splitsRaw,
            suggestedFix: 'Verify shares details in spreadsheet.',
          });
        }
      }
    }

    // --- RULE 11: Membership Violations (Temporal Checks) ---
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      const allCheckedIds = Array.from(new Set([
        ...(resolvedPayerId ? [resolvedPayerId] : []),
        ...resolvedParticipants.map(p => p.userId),
      ]));

      for (const uid of allCheckedIds) {
        const isActiveOnDate = members.find(m => {
          if (m.userId !== uid) return false;
          const joinDay = new Date(m.joinedAt).toISOString().split('T')[0];
          const leaveDay = m.leftAt ? new Date(m.leftAt).toISOString().split('T')[0] : null;
          const checkDay = parsedDate.toISOString().split('T')[0];
          return joinDay <= checkDay && (leaveDay === null || leaveDay >= checkDay);
        });

        if (!isActiveOnDate) {
          const userMeta = members.find(m => m.userId === uid)?.user;
          const uName = userMeta?.name || userMeta?.email || uid;
          rowAnomalies.push({
            type: 'ANOM_MEMB',
            severity: AnomalySeverity.HIGH,
            message: `Membership overlap breach: ${uName} was not in group on expense date (${parsedDate.toLocaleDateString()}).`,
            originalValue: dateStr,
            suggestedFix: 'Exclude user from split, change date, or adjust membership bounds.',
          });
        }
      }
    }

    // --- RULE 12: Duplicate Expenses (Fuzzy Match) ---
    if (parsedDate && !isNaN(parsedDate.getTime()) && amount > 0) {
      const cleanDesc = desc.trim().toLowerCase();
      const amountSubunits = BigInt(Math.round(amount * 100));

      const matchDup = group.expenses.find(existExp => {
        // Date difference is within 1 day (86400000ms)
        const dateDiff = Math.abs(new Date(existExp.date).getTime() - parsedDate.getTime());
        if (dateDiff > 86400000) return false;

        // Amount difference is within 1% tolerance
        const existAmount = Number(existExp.amount);
        const amountDiff = Math.abs(existAmount - Number(amountSubunits));
        if (amountDiff / existAmount > 0.01) return false;

        // Payer matches
        if (resolvedPayerId && existExp.payerId !== resolvedPayerId) return false;

        // Description similarity exceeds 75%
        const sim = getStringSimilarity(existExp.description, cleanDesc);
        return sim >= 0.75;
      });

      if (matchDup) {
        rowAnomalies.push({
          type: 'ANOM_DUP',
          severity: AnomalySeverity.MEDIUM,
          message: `Fuzzy duplicate found: "${desc}" matches existing expense "${matchDup.description}" on ${new Date(matchDup.date).toLocaleDateString()}.`,
          originalValue: desc,
          suggestedFix: 'Mark this row to be skipped to avoid double entry.',
        });
      }
    }

    // 4. Save anomalies found to Database & Update row mapping
    if (rowAnomalies.length > 0) {
      anomaliesFoundCount += rowAnomalies.length;
      
      // Save row changes (adds matched IDs to normalized JSON cache)
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          normalizedExpense: exp,
        },
      });

      // Save anomalies
      for (const anom of rowAnomalies) {
        await prisma.importAnomaly.create({
          data: {
            jobId,
            rowId: row.id,
            rowNumber: row.rowNumber,
            type: anom.type,
            severity: anom.severity,
            message: anom.message,
            originalValue: anom.originalValue,
            suggestedFix: anom.suggestedFix,
            status: AnomalyStatus.UNRESOLVED,
          },
        });
      }
    } else {
      // Row has no anomalies: save the matched IDs
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          normalizedExpense: exp,
          status: AnomalyStatus.RESOLVED, // automatically resolved if clean
        },
      });
    }
  }

  // 5. Update Job Status based on findings
  const finalStatus = anomaliesFoundCount > 0 
    ? ImportJobStatus.ANOMALY_DETECTED 
    : ImportJobStatus.REVIEW_QUEUE;

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: finalStatus },
  });

  return { anomaliesCount: anomaliesFoundCount };
}
