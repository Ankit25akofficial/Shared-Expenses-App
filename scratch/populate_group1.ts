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
  const groupId = 'd3c7f1a7-c6eb-4732-b7c5-2b84425cf912'; // group1 ID

  console.log('1. Setting up 7 members in group1...');
  
  const usersToCreate = [
    { email: 'rohan128@gmail.com', name: 'Rohan', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null },
    { email: 'aisha123@gmail.com', name: 'Aisha', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null },
    { email: 'priya123@gmail.com', name: 'Priya', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null },
    { email: 'meera123@gmail.com', name: 'Meera', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: new Date('2026-03-31T23:59:59.999Z') },
    { email: 'sam123@gmail.com', name: 'Sam', joinedAt: new Date('2026-04-15T00:00:00.000Z'), leftAt: null },
    { email: 'dev123@gmail.com', name: 'Dev', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null },
    { email: 'ankitkumar252508@gmail.com', name: 'Ankit', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null }
  ];

  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash('password', 10);
  const dbUsers: any = {};

  for (const item of usersToCreate) {
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: { name: item.name },
      create: { email: item.email, name: item.name, passwordHash }
    });

    dbUsers[item.email] = user;

    const existingMembership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: user.id }
    });

    if (existingMembership) {
      await prisma.groupMembership.update({
        where: { id: existingMembership.id },
        data: {
          joinedAt: item.joinedAt,
          leftAt: item.leftAt
        }
      });
      console.log(`Updated membership for ${item.name} (${item.email}).`);
    } else {
      await prisma.groupMembership.create({
        data: {
          groupId,
          userId: user.id,
          joinedAt: item.joinedAt,
          leftAt: item.leftAt
        }
      });
      console.log(`Created membership for ${item.name} (${item.email}).`);
    }
  }

  console.log('2. Staging CSV import job under group1...');
  
  // Find uploader (Rohan or Aisha)
  const uploader = dbUsers['rohan128@gmail.com'];

  // Delete any existing import jobs for this group for a clean slate
  await prisma.importJob.deleteMany({
    where: { groupId }
  });

  const job = await prisma.importJob.create({
    data: {
      groupId,
      userId: uploader.id,
      fileName: 'expenses_export.csv',
      status: ImportJobStatus.VALIDATING,
      rowCount: 12
    }
  });

  // Define the raw rows to insert (matching the uploader structure)
  const rowsData = [
    {
      rowNumber: 1,
      rawData: { date: "2026-02-01", description: "February Rent", paid_by: "Aisha", amount: "48000", currency: "INR", split_type: "equal", split_with: "Aisha;Rohan;Priya;Meera", split_details: "", notes: "" },
      normalizedExpense: { description: "February Rent", amount: 48000, currency: "INR", date: "2026-02-01T00:00:00.000Z", payerName: "Aisha", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['aisha123@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['meera123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 2,
      rawData: { date: "2026-02-03", description: "Groceries BigBasket", paid_by: "Priya", amount: "2340", currency: "INR", split_type: "equal", split_with: "Aisha;Rohan;Priya;Meera", split_details: "", notes: "" },
      normalizedExpense: { description: "Groceries BigBasket", amount: 2340, currency: "INR", date: "2026-02-03T00:00:00.000Z", payerName: "Priya", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['priya123@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['meera123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 3,
      rawData: { date: "2026-02-05", description: "Wifi Bill Feb", paid_by: "Rohan", amount: "1199", currency: "INR", split_type: "equal", split_with: "Aisha;Rohan;Priya;Meera", split_details: "", notes: "" },
      normalizedExpense: { description: "Wifi Bill Feb", amount: 1199, currency: "INR", date: "2026-02-05T00:00:00.000Z", payerName: "Rohan", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['rohan128@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['meera123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 4,
      rawData: { date: "2026-02-08", description: "Dinner at Marina Bites", paid_by: "Aisha", amount: "3200", currency: "INR", split_type: "equal", split_with: "Aisha;Rohan;Priya;Meera", split_details: "", notes: "" },
      normalizedExpense: { description: "Dinner at Marina Bites", amount: 3200, currency: "INR", date: "2026-02-08T00:00:00.000Z", payerName: "Aisha", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['aisha123@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['meera123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 5,
      rawData: { date: "2026-02-08", description: "dinner - marina bites", paid_by: "Aisha", amount: "3200", currency: "INR", split_type: "equal", split_with: "Aisha;Rohan;Priya;Meera", split_details: "Possible duplicate", notes: "" },
      normalizedExpense: { description: "dinner - marina bites", amount: 3200, currency: "INR", date: "2026-02-08T00:00:00.000Z", payerName: "Aisha", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['aisha123@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['meera123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 6,
      rawData: { date: "2026-02-10", description: "Electricity Feb", paid_by: "Aisha", amount: "1,200", currency: "INR", split_type: "equal", split_with: "Aisha;Rohan;Priya;Meera", split_details: "Amount formatting issue", notes: "" },
      normalizedExpense: { description: "Electricity Feb", amount: 1200, currency: "INR", date: "2026-02-10T00:00:00.000Z", payerName: "Aisha", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['aisha123@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['meera123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 7,
      rawData: { date: "2026-02-14", description: "Movie Night Snacks", paid_by: "priya", amount: "640", currency: "INR", split_type: "equal", split_with: "Aisha;Rohan;Priya", split_details: "Name inconsistency", notes: "" },
      normalizedExpense: { description: "Movie Night Snacks", amount: 640, currency: "INR", date: "2026-02-14T00:00:00.000Z", payerName: "priya", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['priya123@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 8,
      rawData: { date: "2026-02-15", description: "Cylinder Refill", paid_by: "Rohan", amount: "899.995", currency: "INR", split_type: "equal", split_with: "Aisha;Rohan;Priya;Meera", split_details: "Precision anomaly", notes: "" },
      normalizedExpense: { description: "Cylinder Refill", amount: 900, currency: "INR", date: "2026-02-15T00:00:00.000Z", payerName: "Rohan", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['rohan128@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['meera123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 9,
      rawData: { date: "2026-02-22", description: "House Cleaning Supplies", paid_by: "", amount: "780", currency: "INR", split_type: "equal", split_with: "Aisha;Rohan;Priya;Meera", split_details: "Missing paid_by", notes: "" },
      normalizedExpense: { description: "House Cleaning Supplies", amount: 780, currency: "INR", date: "2026-02-22T00:00:00.000Z", payerName: "", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['aisha123@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['meera123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 10,
      rawData: { date: "2026-02-25", description: "Rohan Paid Aisha Back", paid_by: "Rohan", amount: "5000", currency: "INR", split_type: "", split_with: "Aisha", split_details: "Settlement disguised as expense", notes: "" },
      normalizedExpense: { description: "Rohan Paid Aisha Back", amount: 5000, currency: "INR", date: "2026-02-25T00:00:00.000Z", payerName: "Rohan", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['rohan128@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 11,
      rawData: { date: "2026-04-18", description: "April Electricity", paid_by: "Aisha", amount: "1450", currency: "INR", split_type: "equal", split_with: "Aisha;Rohan;Priya;Sam", split_details: "Sam joined mid-April", notes: "" },
      normalizedExpense: { description: "April Electricity", amount: 1450, currency: "INR", date: "2026-04-18T00:00:00.000Z", payerName: "Aisha", splitType: "EQUAL", splitsRaw: "", payerId: dbUsers['aisha123@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 1 }, { userId: dbUsers['sam123@gmail.com'].id, splitValue: 1 }] }
    },
    {
      rowNumber: 12,
      rawData: { date: "2026-04-20", description: "Welcome Dinner", paid_by: "Sam", amount: "2800", currency: "INR", split_type: "percentage", split_with: "Aisha;Rohan;Priya;Sam", split_details: "Aisha 25%; Rohan 25%; Priya 25%; Sam 35%", notes: "Percentages exceed 100%" },
      normalizedExpense: { description: "Welcome Dinner", amount: 2800, currency: "INR", date: "2026-04-20T00:00:00.000Z", payerName: "Sam", splitType: "PERCENTAGE", splitsRaw: "", payerId: dbUsers['sam123@gmail.com'].id, participants: [{ userId: dbUsers['aisha123@gmail.com'].id, splitValue: 22.73 }, { userId: dbUsers['rohan128@gmail.com'].id, splitValue: 22.73 }, { userId: dbUsers['priya123@gmail.com'].id, splitValue: 22.73 }, { userId: dbUsers['sam123@gmail.com'].id, splitValue: 31.81 }] }
    }
  ];

  for (const row of rowsData) {
    const isSkipped = row.rowNumber === 5 || row.rowNumber === 10;
    await prisma.importRow.create({
      data: {
        jobId: job.id,
        rowNumber: row.rowNumber,
        rawData: row.rawData,
        status: isSkipped ? AnomalyStatus.SKIPPED : AnomalyStatus.RESOLVED,
        normalizedExpense: row.normalizedExpense
      }
    });
  }

  // Create the direct settlement for Rohan Paid Aisha Back (Row 10)
  const existingSettlement = await prisma.settlement.findFirst({
    where: {
      groupId,
      payerId: dbUsers['rohan128@gmail.com'].id,
      payeeId: dbUsers['aisha123@gmail.com'].id,
      amount: BigInt(500000)
    }
  });

  if (!existingSettlement) {
    await prisma.settlement.create({
      data: {
        groupId,
        payerId: dbUsers['rohan128@gmail.com'].id,
        payeeId: dbUsers['aisha123@gmail.com'].id,
        amount: BigInt(500000), // 5,000.00 INR
        currency: 'INR',
        date: new Date('2026-02-25T00:00:00.000Z')
      }
    });
    console.log('Recorded Row 10 direct Settlement in DB.');
  }

  // 3. Commit the import job sequentially
  console.log('3. Committing import job to primary tables sequentially under group1...');
  const activeRowsData = rowsData.filter(r => r.rowNumber !== 5 && r.rowNumber !== 10);

  let expensesCreated = 0;
  let totalAmountAdded = BigInt(0);

  for (const row of activeRowsData) {
    const { description, amount, currency, date, payerId, splitType, participants } = row.normalizedExpense;
    const expenseDate = new Date(date);
    const totalSubunits = BigInt(Math.round(amount * 100));

    const splitResults = calculateSplits(totalSubunits, splitType as SplitType, participants);

    // Delete existing matching expense if re-running
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
    where: { id: job.id },
    data: { status: ImportJobStatus.COMPLETED }
  });

  console.log('Group1 successfully populated and committed!');
  console.log(`  Expenses created: ${expensesCreated}`);
  console.log(`  Total amount added: ${Number(totalAmountAdded) / 100} INR`);
  console.log('ALL TASKS COMPLETED SUCCESSFULLY!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
