import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { ImportJobStatus, AnomalyStatus } from '@prisma/client';
import { runAnomalyDetection } from '@/lib/anomalies';

// Helper: Normalize CSV headers to match system fields
function mapHeaders(headers: string[]): { [key: string]: string } {
  const mapping: { [key: string]: string } = {};
  headers.forEach((h) => {
    const clean = h.trim().toLowerCase();
    if (clean.includes('date')) {
      mapping['date'] = h;
    } else if (clean.includes('desc') || clean.includes('item') || (clean.includes('details') && !clean.includes('split'))) {
      mapping['description'] = h;
    } else if (clean.includes('amount') || clean.includes('cost') || clean.includes('value')) {
      mapping['amount'] = h;
    } else if (clean.includes('curr')) {
      mapping['currency'] = h;
    } else if (clean.includes('paid') || clean.includes('payer') || clean.includes('by')) {
      mapping['paidBy'] = h;
    } else if (clean.includes('split') && clean.includes('type') || clean.includes('mode') || clean.includes('split_type')) {
      mapping['splitType'] = h;
    } else if (clean.includes('participants') || clean.includes('members') || clean.includes('share') || clean.includes('split details') || clean.includes('splits')) {
      mapping['splits'] = h;
    }
  });
  return mapping;
}

export async function GET() {
  try {
    // 1. Find the group named "group2"
    const group = await prisma.group.findFirst({
      where: { name: 'group2' },
    });

    if (!group) {
      return NextResponse.json({
        error: 'Group "group2" not found. Please create a group named "group2" in the UI first.',
      }, { status: 404 });
    }

    // 2. Define users to create
    const usersToCreate = [
      { email: 'aisha123@gmail.com', name: 'Aisha', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null },
      { email: 'rohan123@gmail.com', name: 'Rohan', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null },
      { email: 'priya123@gmail.com', name: 'Priya', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: null },
      { email: 'meera123@gmail.com', name: 'Meera', joinedAt: new Date('2026-02-01T00:00:00.000Z'), leftAt: new Date('2026-03-31T23:59:59.999Z') },
      { email: 'sam123@gmail.com', name: 'Sam', joinedAt: new Date('2026-04-15T00:00:00.000Z'), leftAt: null },
    ];

    const passwordHash = await bcrypt.hash('password', 10);
    const dbUsers = [];

    for (const item of usersToCreate) {
      const user = await prisma.user.upsert({
        where: { email: item.email },
        update: { name: item.name, passwordHash },
        create: { email: item.email, name: item.name, passwordHash },
      });

      const existingMembership = await prisma.groupMembership.findFirst({
        where: { groupId: group.id, userId: user.id },
      });

      if (existingMembership) {
        await prisma.groupMembership.update({
          where: { id: existingMembership.id },
          data: {
            joinedAt: item.joinedAt,
            leftAt: item.leftAt,
          },
        });
      } else {
        await prisma.groupMembership.create({
          data: {
            groupId: group.id,
            userId: user.id,
            joinedAt: item.joinedAt,
            leftAt: item.leftAt,
          },
        });
      }
      dbUsers.push(user);
    }

    // Find first user (Aisha or any) to associate as the uploader of the job
    const uploader = dbUsers[0];

    // 3. Clear existing imports for clean state
    await prisma.importJob.deleteMany({
      where: { groupId: group.id },
    });

    // 4. Read the CSV file
    const csvPath = path.resolve(process.cwd(), 'public', 'expenses_export.csv');
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({ error: 'CSV file not found in public folder.' }, { status: 400 });
    }
    const csvText = fs.readFileSync(csvPath, 'utf8');

    // 5. Initialize Job
    const job = await prisma.importJob.create({
      data: {
        groupId: group.id,
        userId: uploader.id,
        fileName: 'expenses_export.csv',
        status: ImportJobStatus.VALIDATING,
        rowCount: 0,
      },
    });

    // 6. Parse headers and rows
    const parsed = Papa.parse<any>(csvText, {
      header: true,
      skipEmptyLines: 'greedy',
    });

    const headers = parsed.meta.fields || [];
    const headerMap = mapHeaders(headers);

    const importRowsData = parsed.data.map((row, idx) => {
      const rowNum = idx + 1;
      const rawDate = row[headerMap['date']] || '';
      const rawDesc = row[headerMap['description']] || '';
      const rawAmount = row[headerMap['amount']] || '';
      const rawCurrency = headerMap['currency'] ? row[headerMap['currency']] : '';
      const rawPaidBy = row[headerMap['paidBy']] || '';
      const rawSplitType = headerMap['splitType'] ? row[headerMap['splitType']] : 'EQUAL';
      const rawSplits = headerMap['splits'] ? row[headerMap['splits']] : '';

      let normalizedDate = '';
      if (rawDate) {
        const parsedDate = new Date(rawDate);
        if (!isNaN(parsedDate.getTime())) {
          normalizedDate = parsedDate.toISOString();
        }
      }

      let splitTypeEnum = 'EQUAL';
      const cleanSplitType = rawSplitType.trim().toUpperCase();
      if (cleanSplitType.includes('UNEQUAL') || cleanSplitType.includes('EXACT')) {
        splitTypeEnum = 'UNEQUAL';
      } else if (cleanSplitType.includes('PERCENT') || cleanSplitType.includes('%')) {
        splitTypeEnum = 'PERCENTAGE';
      } else if (cleanSplitType.includes('SHARE') || cleanSplitType.includes('WEIGHT')) {
        splitTypeEnum = 'SHARES';
      }

      const normalizedExpense = {
        description: rawDesc.trim(),
        amount: parseFloat(rawAmount.replace(/,/g, '')) || 0, // Handle formatting commas
        currency: (rawCurrency.trim() || 'INR').toUpperCase(),
        date: normalizedDate || null,
        payerName: rawPaidBy.trim(),
        splitType: splitTypeEnum,
        splitsRaw: rawSplits.trim(),
      };

      return {
        rowNumber: rowNum,
        rawData: row,
        status: AnomalyStatus.UNRESOLVED,
        normalizedExpense,
      };
    });

    // Write all normalized rows
    await prisma.$transaction(
      importRowsData.map(row => 
        prisma.importRow.create({
          data: {
            jobId: job.id,
            rowNumber: row.rowNumber,
            rawData: row.rawData,
            status: row.status,
            normalizedExpense: row.normalizedExpense,
          }
        })
      )
    );

    // Update row count
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        rowCount: importRowsData.length,
      },
    });

    // 7. Run Anomaly Detection Engine
    await runAnomalyDetection(job.id, group.id);

    return NextResponse.json({
      message: 'Successfully populated members and staged CSV import job!',
      groupId: group.id,
      jobId: job.id,
      rowCount: importRowsData.length,
    });
  } catch (error: any) {
    console.error('Setup endpoint error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
