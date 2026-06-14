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
  const anomalies = await prisma.importAnomaly.findMany();
  for (const a of anomalies) {
    console.log(`Anomaly ID: ${a.id}`);
    console.log(`  RowNumber: ${a.rowNumber}`);
    console.log(`  Type: ${a.type}`);
    console.log(`  Message: ${a.message}`);
    console.log(`  SuggestedFix: ${a.suggestedFix}`);
    console.log(`  OriginalValue: ${a.originalValue}`);
    console.log(`  Status: ${a.status}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
