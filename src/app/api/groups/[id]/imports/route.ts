import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import Papa from 'papaparse';
import { AuditAction, ImportJobStatus, AnomalyStatus } from '@prisma/client';
import { createAuditLog } from '@/lib/audit';
import { runAnomalyDetection } from '@/lib/anomalies';

// Helper: Normalize CSV headers to match system fields
function mapHeaders(headers: string[]): { [key: string]: string } {
  const mapping: { [key: string]: string } = {};
  
  headers.forEach((h, idx) => {
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

// GET /api/groups/[id]/imports - List all import jobs in a group
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId } = await params;

    const member = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id },
    });

    if (!member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const jobs = await prisma.importJob.findMany({
      where: { groupId },
      include: {
        user: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('GET imports list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[id]/imports - Upload a CSV and create an import job
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId } = await params;

    // Verify caller is active
    const member = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id, leftAt: null },
    });

    if (!member) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member.' }, { status: 403 });
    }

    const body = await request.json();
    const { csvText, fileName } = body;

    if (!csvText) {
      return NextResponse.json({ error: 'CSV data is required.' }, { status: 400 });
    }

    // 1. Raw Upload Stage - Initialize Job
    const job = await prisma.importJob.create({
      data: {
        groupId,
        userId: session.user.id,
        fileName: fileName || 'upload.csv',
        status: ImportJobStatus.VALIDATING,
        rowCount: 0,
      },
    });

    // 2. CSV Validation Stage - Parse headers and check structure
    const parsed = Papa.parse<any>(csvText, {
      header: true,
      skipEmptyLines: 'greedy',
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      await prisma.importJob.update({
        where: { id: job.id },
        data: { status: ImportJobStatus.FAILED },
      });
      return NextResponse.json({ error: 'Malformed CSV file. Could not parse rows.' }, { status: 400 });
    }

    const headers = parsed.meta.fields || [];
    const headerMap = mapHeaders(headers);

    // Validate presence of required schema fields
    const requiredFields = ['date', 'description', 'amount', 'paidBy'];
    const missing = requiredFields.filter(f => !headerMap[f]);

    if (missing.length > 0) {
      await prisma.importJob.update({
        where: { id: job.id },
        data: { status: ImportJobStatus.FAILED },
      });
      return NextResponse.json({
        error: `CSV Validation Failed: Missing required columns matching: ${missing.join(', ')}. Found headers: ${headers.join(', ')}`,
      }, { status: 400 });
    }

    // 3. Data Normalization Stage - Parse and normalize each row
    const importRowsData = parsed.data.map((row, idx) => {
      const rowNum = idx + 1;

      // Extract raw strings using header mapping
      const rawDate = row[headerMap['date']] || '';
      const rawDesc = row[headerMap['description']] || '';
      const rawAmount = row[headerMap['amount']] || '';
      const rawCurrency = headerMap['currency'] ? row[headerMap['currency']] : '';
      const rawPaidBy = row[headerMap['paidBy']] || '';
      const rawSplitType = headerMap['splitType'] ? row[headerMap['splitType']] : 'EQUAL';
      const rawSplits = headerMap['splits'] ? row[headerMap['splits']] : '';

      // Normalize date (try parsing standard layouts)
      let normalizedDate = '';
      if (rawDate) {
        const parsedDate = new Date(rawDate);
        if (!isNaN(parsedDate.getTime())) {
          normalizedDate = parsedDate.toISOString();
        }
      }

      // Normalize Split Type string to enum
      let splitTypeEnum = 'EQUAL';
      const cleanSplitType = rawSplitType.trim().toUpperCase();
      if (cleanSplitType.includes('UNEQUAL') || cleanSplitType.includes('EXACT')) {
        splitTypeEnum = 'UNEQUAL';
      } else if (cleanSplitType.includes('PERCENT') || cleanSplitType.includes('%')) {
        splitTypeEnum = 'PERCENTAGE';
      } else if (cleanSplitType.includes('SHARE') || cleanSplitType.includes('WEIGHT')) {
        splitTypeEnum = 'SHARES';
      }

      // Build intermediate normalized structure
      const normalizedExpense = {
        description: rawDesc.trim(),
        amount: parseFloat(rawAmount) || 0,
        currency: (rawCurrency.trim() || 'INR').toUpperCase(),
        date: normalizedDate || null, // null date triggers anomaly downstream
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

    // Write all normalized rows to the database inside a transaction
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
    const updatedJob = await prisma.importJob.update({
      where: { id: job.id },
      data: {
        rowCount: importRowsData.length,
      },
    });

    // Stage 4: Run the Anomaly Detection Engine
    await runAnomalyDetection(job.id, groupId);

    // Refetch the job to record the final state in audit log
    const finalJob = await prisma.importJob.findUnique({
      where: { id: job.id },
    });

    // Audit job creation
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.IMPORT_JOB_CREATE,
      entityName: 'ImportJob',
      entityId: job.id,
      newValues: finalJob,
    });

    return NextResponse.json({
      message: 'CSV uploaded, normalized, and scanned for anomalies.',
      jobId: job.id,
      rowCount: finalJob?.rowCount || 0,
      status: finalJob?.status,
    }, { status: 201 });

  } catch (error) {
    console.error('POST import CSV error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
