import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

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
  console.log('--- GROUPS ---');
  const groups = await prisma.group.findMany();
  for (const g of groups) {
    console.log(`Group: ${g.name} (ID: ${g.id})`);
  }

  console.log('\n--- USERS & MEMBERSHIPS ---');
  const memberships = await prisma.groupMembership.findMany({
    include: {
      user: true,
      group: true
    }
  });
  for (const m of memberships) {
    console.log(`Member: ${m.user.name} (${m.user.email}) in Group: ${m.group.name}`);
    console.log(`  Membership ID: ${m.id}`);
    console.log(`  Joined: ${m.joinedAt.toISOString()}, Left: ${m.leftAt ? m.leftAt.toISOString() : 'active'}`);
  }

  console.log('\n--- EXPENSES ---');
  const expenses = await prisma.expense.findMany({
    include: {
      payer: true
    }
  });
  console.log(`Total active expenses: ${expenses.length}`);
  for (const e of expenses) {
    console.log(`Expense: ${e.description} - ${e.amount.toString()} ${e.currency} paid by ${e.payer.name} on ${e.date.toISOString()}`);
  }

  console.log('\n--- IMPORT JOBS ---');
  const jobs = await prisma.importJob.findMany({
    include: {
      group: true
    }
  });
  for (const j of jobs) {
    console.log(`Job ID: ${j.id} for Group: ${j.group.name}`);
    console.log(`  Status: ${j.status}, Rows: ${j.rowCount}, File: ${j.fileName}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
