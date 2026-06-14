import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

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
  const jobId = '613b4e36-b85a-4931-aed7-92bd249255b8';
  const rows = await prisma.importRow.findMany({
    where: { jobId },
    orderBy: { rowNumber: 'asc' }
  });

  for (const row of rows) {
    console.log(`Row ${row.rowNumber} (Status: ${row.status}):`);
    console.log(`  Raw: ${JSON.stringify(row.rawData)}`);
    console.log(`  Normalized: ${JSON.stringify(row.normalizedExpense)}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
