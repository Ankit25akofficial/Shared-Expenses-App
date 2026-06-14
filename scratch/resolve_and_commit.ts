import { PrismaClient, AnomalyStatus, ImportJobStatus, SplitType } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { calculateSplits } from '../src/lib/splits';

// Load env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const eqIdx = trimmedLine.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmedLine.substring(0, eqIdx).trim();
        let val = trimmedLine.substring(eqIdx + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
        if (key) {
          process.env[key] = val;
        }
      }
    }
  }
}

const prisma = new PrismaClient();

async function main() {
  const groupId = 'dd7905d3-e42b-4aa2-b14c-0c29d5ae9ce7';
  const jobId = '613b4e36-b85a-4931-aed7-92bd249255b8';

  console.log('1. Cleaning up duplicate Rohan membership...');
  const duplicateRohanMembership = await prisma.groupMembership.findFirst({
    where: {
      groupId,
      user: {
        email: 'rohan128@gmail.com'
      }
    }
  });

  if (duplicateRohanMembership) {
    console.log(`Found duplicate Rohan membership ID: ${duplicateRohanMembership.id}. Deleting...`);
    await prisma.groupMembership.delete({
      where: { id: duplicateRohanMembership.id }
    });
  } else {
    console.log('No duplicate Rohan membership found.');
  }

  console.log('2. Deleting manual test expenses dated 2026-06-14...');
  const deletedExpenses = await prisma.expense.deleteMany({
    where: {
      groupId,
      date: {
        gte: new Date('2026-06-14T00:00:00Z'),
        lt: new Date('2026-06-15T00:00:00Z')
      }
    }
  });
  console.log(`Deleted ${deletedExpenses.count} manual test expenses.`);

  console.log('3. Resolving import anomalies...');
  
  // User IDs from inspect_db and query_all_rows
  const aishaId = 'f486d58d-6b31-4cb8-bcf0-004be54d5f1d';
  const rohanId = 'ac4e5991-c337-497b-a915-2bbf9ea562dd'; // Correct Rohan
  const priyaId = '10716d17-03d5-4aa9-adcc-3f7d50c0fa41';
  const meeraId = '66291e93-c7d9-414a-ab99-c51713136b3f';
  const samId = '6ff55302-e97a-4b43-bf82-5ea50875a5ac';

  // Fetch all rows for the job
  const rows = await prisma.importRow.findMany({
    where: { jobId },
    include: { anomalies: true }
  });

  for (const row of rows) {
    let norm = row.normalizedExpense as any;
    if (!norm) continue;

    console.log(`Processing Row ${row.rowNumber} (${norm.description})...`);

    if (row.rowNumber === 3) {
      // Wifi Bill Feb: Fix payerId
      norm.payerId = rohanId;
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          normalizedExpense: norm,
          status: AnomalyStatus.RESOLVED
        }
      });
      await prisma.importAnomaly.updateMany({
        where: { rowId: row.id },
        data: { status: AnomalyStatus.RESOLVED, actionTaken: 'Mapped to correct Rohan user ID.' }
      });
      console.log(`  Row ${row.rowNumber} Wifi Bill Feb: Resolved.`);
    } 
    else if (row.rowNumber === 5) {
      // dinner - marina bites: Skip duplicate
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          status: AnomalyStatus.SKIPPED
        }
      });
      await prisma.importAnomaly.updateMany({
        where: { rowId: row.id },
        data: { status: AnomalyStatus.SKIPPED, actionTaken: 'Skipped duplicate entry.' }
      });
      console.log(`  Row ${row.rowNumber} Duplicate Dinner: Skipped.`);
    } 
    else if (row.rowNumber === 8) {
      // Cylinder Refill: Round amount to 900.00 and set correct Rohan as payer
      norm.amount = 900;
      norm.payerId = rohanId;
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          normalizedExpense: norm,
          status: AnomalyStatus.RESOLVED
        }
      });
      await prisma.importAnomaly.updateMany({
        where: { rowId: row.id },
        data: { status: AnomalyStatus.RESOLVED, actionTaken: 'Rounded to 900.00 and mapped to correct Rohan.' }
      });
      console.log(`  Row ${row.rowNumber} Cylinder Refill: Resolved.`);
    } 
    else if (row.rowNumber === 9) {
      // House Cleaning Supplies: Set Aisha as payer
      norm.payerId = aishaId;
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          normalizedExpense: norm,
          status: AnomalyStatus.RESOLVED
        }
      });
      await prisma.importAnomaly.updateMany({
        where: { rowId: row.id },
        data: { status: AnomalyStatus.RESOLVED, actionTaken: 'Set Aisha as payer.' }
      });
      console.log(`  Row ${row.rowNumber} House Cleaning Supplies: Resolved.`);
    } 
    else if (row.rowNumber === 10) {
      // Rohan Paid Aisha Back: Skip row and record direct settlement
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          status: AnomalyStatus.SKIPPED
        }
      });
      await prisma.importAnomaly.updateMany({
        where: { rowId: row.id },
        data: { status: AnomalyStatus.SKIPPED, actionTaken: 'Skipped as disguised settlement.' }
      });

      // Record direct settlement if not already recorded
      const existingSettlement = await prisma.settlement.findFirst({
        where: {
          groupId,
          payerId: rohanId,
          payeeId: aishaId,
          amount: BigInt(500000)
        }
      });

      if (!existingSettlement) {
        await prisma.settlement.create({
          data: {
            groupId,
            payerId: rohanId,
            payeeId: aishaId,
            amount: BigInt(500000), // 5,000.00 INR
            currency: 'INR',
            date: new Date('2026-02-25T00:00:00.000Z')
          }
        });
        console.log(`  Row ${row.rowNumber} Rohan Paid Aisha Back: Recorded direct Settlement in DB.`);
      } else {
        console.log(`  Row ${row.rowNumber} Rohan Paid Aisha Back: Settlement already exists in DB.`);
      }
    } 
    else if (row.rowNumber === 12) {
      // Welcome Dinner: Adjust percentages to sum to 100%
      norm.participants = [
        { userId: aishaId, splitValue: 22.73 },
        { userId: rohanId, splitValue: 22.73 },
        { userId: priyaId, splitValue: 22.73 },
        { userId: samId, splitValue: 31.81 }
      ];
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          normalizedExpense: norm,
          status: AnomalyStatus.RESOLVED
        }
      });
      await prisma.importAnomaly.updateMany({
        where: { rowId: row.id },
        data: { status: AnomalyStatus.RESOLVED, actionTaken: 'Adjusted percentages to scale to 100%.' }
      });
      console.log(`  Row ${row.rowNumber} Welcome Dinner: Resolved.`);
    } 
    else {
      // Clean rows without anomalies
      await prisma.importRow.update({
        where: { id: row.id },
        data: { status: AnomalyStatus.RESOLVED }
      });
    }
  }

  // 4. Update import job status to REVIEW_QUEUE to allow commit
  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: ImportJobStatus.REVIEW_QUEUE }
  });
  console.log('Import job status set to REVIEW_QUEUE.');

  // 5. Commit the Import Job sequentially (without transactional wrapper to avoid timeouts)
  console.log('4. Committing import job to primary tables sequentially...');
  
  // Reload job and its rows
  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: {
      rows: {
        include: { anomalies: true }
      }
    }
  });

  if (!job) throw new Error('Job not found after updating.');

  const activeRows = job.rows.filter(r => r.status !== AnomalyStatus.SKIPPED);
  
  // Verify there are no unresolved anomalies
  const hasUnresolved = activeRows.some(r =>
    r.anomalies.some(a => a.status === AnomalyStatus.UNRESOLVED)
  );

  if (hasUnresolved) {
    console.error('Cannot commit: there are still unresolved anomalies.');
    return;
  }

  let expensesCreated = 0;
  let totalAmountAdded = BigInt(0);

  for (const row of activeRows) {
    const expenseData = row.normalizedExpense as any;
    if (!expenseData) continue;

    const { description, amount, currency, date, payerId, splitType, participants } = expenseData;
    const expenseDate = new Date(date);
    const totalSubunits = BigInt(Math.round(amount * 100));

    const splitResults = calculateSplits(totalSubunits, splitType, participants);

    // Delete existing matching expense if we are re-running
    const existingExpense = await prisma.expense.findFirst({
      where: {
        groupId,
        description,
        amount: totalSubunits,
        date: expenseDate,
        payerId
      }
    });

    if (existingExpense) {
      await prisma.expense.delete({
        where: { id: existingExpense.id }
      });
    }

    const expense = await prisma.expense.create({
      data: {
        groupId,
        description,
        amount: totalSubunits,
        currency: currency.toUpperCase(),
        date: expenseDate,
        payerId,
        splitType: splitType as SplitType
      }
    });

    await prisma.expenseParticipant.createMany({
      data: splitResults.map(p => ({
        expenseId: expense.id,
        userId: p.userId,
        owedAmount: p.owedAmount,
        splitValue: p.splitValue
      }))
    });

    expensesCreated++;
    totalAmountAdded += totalSubunits;
    console.log(`  Committed expense: ${description} (${Number(totalSubunits) / 100} ${currency})`);
  }

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: ImportJobStatus.COMPLETED }
  });

  console.log('Import job COMMITTED successfully!');
  console.log(`  Expenses created: ${expensesCreated}`);
  console.log(`  Total amount added: ${Number(totalAmountAdded) / 100} INR`);
  
  // 5. Auto-provision Dev to the group roster (email dev123@gmail.com, joined on 2026-02-01)
  console.log('5. Auto-provisioning Dev in the database...');
  const devEmail = 'dev123@gmail.com';
  let devUser = await prisma.user.findUnique({
    where: { email: devEmail }
  });

  if (!devUser) {
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash('password', 10);
    devUser = await prisma.user.create({
      data: {
        email: devEmail,
        name: 'Dev',
        passwordHash
      }
    });
  }

  const devMembership = await prisma.groupMembership.findFirst({
    where: { groupId, userId: devUser.id }
  });

  if (!devMembership) {
    await prisma.groupMembership.create({
      data: {
        groupId,
        userId: devUser.id,
        joinedAt: new Date('2026-02-01T00:00:00.000Z')
      }
    });
    console.log('Dev has been successfully added to group2.');
  } else {
    console.log('Dev is already a member of group2.');
  }

  console.log('ALL TASKS COMPLETED SUCCESSFULLY!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
