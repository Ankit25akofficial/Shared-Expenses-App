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
  const job = await prisma.importJob.findFirst({
    where: { id: jobId },
    include: {
      rows: {
        include: {
          anomalies: true
        }
      }
    }
  });

  if (!job) {
    console.log('Job not found');
    return;
  }

  console.log(`Job: ${job.fileName}, Status: ${job.status}`);
  for (const row of job.rows) {
    console.log(`\nRow ${row.rowNumber} (Status: ${row.status}):`);
    console.log(`  Raw:`, JSON.stringify(row.rawData));
    console.log(`  Normalized:`, JSON.stringify(row.normalizedExpense));
    if (row.anomalies.length > 0) {
      console.log(`  Anomalies:`);
      for (const a of row.anomalies) {
        console.log(`    - ID: ${a.id}, Type: ${a.type}, Severity: ${a.severity}, Message: "${a.message}", Status: ${a.status}`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
