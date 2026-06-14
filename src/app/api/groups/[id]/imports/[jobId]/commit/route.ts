import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { calculateSplits } from '@/lib/splits';
import { AuditAction, ImportJobStatus, AnomalyStatus } from '@prisma/client';
import { createAuditLog } from '@/lib/audit';

// POST /api/groups/[id]/imports/[jobId]/commit - Commit approved rows to primary tables
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId, jobId } = await params;

    // Verify caller is active
    const member = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id, leftAt: null },
    });

    if (!member) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member.' }, { status: 403 });
    }

    // Load import job with its rows
    const job = await prisma.importJob.findFirst({
      where: { id: jobId, groupId },
      include: {
        rows: {
          include: {
            anomalies: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Import job not found.' }, { status: 404 });
    }

    if (job.status === ImportJobStatus.COMPLETED) {
      return NextResponse.json({ error: 'This import job has already been committed.' }, { status: 400 });
    }

    // Check if there are any unresolved anomalies in rows that are not skipped
    const activeRows = job.rows.filter(r => r.status !== AnomalyStatus.SKIPPED);
    const hasUnresolved = activeRows.some(r => 
      r.anomalies.some(a => a.status === AnomalyStatus.UNRESOLVED)
    );

    if (hasUnresolved) {
      return NextResponse.json({
        error: 'Cannot commit. There are unresolved anomalies. Please resolve or skip them first.',
      }, { status: 400 });
    }

    // Stage 7: Database Persistence (within a single transactional wrapper)
    const commitReport = await prisma.$transaction(async (tx) => {
      let expensesCreated = 0;
      let totalAmountAdded = 0n;

      for (const row of activeRows) {
        const expenseData = row.normalizedExpense as any;
        if (!expenseData) continue;

        const { description, amount, currency, date, payerId, splitType, participants } = expenseData;

        // Perform temporal check on date
        const expenseDate = new Date(date);
        
        // Convert floating point to integer cents/paise
        const totalSubunits = BigInt(Math.round(amount * 100));

        // Re-calculate splits
        const splitResults = calculateSplits(totalSubunits, splitType, participants);

        // Create the Expense row
        const expense = await tx.expense.create({
          data: {
            groupId,
            description,
            amount: totalSubunits,
            currency: currency.toUpperCase(),
            date: expenseDate,
            payerId,
            splitType,
          },
        });

        // Create the participants
        await tx.expenseParticipant.createMany({
          data: splitResults.map(p => ({
            expenseId: expense.id,
            userId: p.userId,
            owedAmount: p.owedAmount,
            splitValue: p.splitValue,
          })),
        });

        expensesCreated++;
        totalAmountAdded += totalSubunits;
      }

      // Update import job status
      await tx.importJob.update({
        where: { id: jobId },
        data: { status: ImportJobStatus.COMPLETED },
      });

      return {
        expensesCreated,
        totalAmountAdded: Number(totalAmountAdded),
      };
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.IMPORT_JOB_PROCESS,
      entityName: 'ImportJob',
      entityId: jobId,
      newValues: {
        jobId,
        status: ImportJobStatus.COMPLETED,
        report: commitReport,
      },
    });

    // Stage 8: Import Report Generation
    return NextResponse.json({
      message: 'Import committed successfully.',
      report: {
        jobId,
        rowsCommitted: commitReport.expensesCreated,
        rowsSkipped: job.rows.length - commitReport.expensesCreated,
        totalSubunitsAdded: commitReport.totalAmountAdded,
      },
    });

  } catch (error: any) {
    console.error('Commit import error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error occurred.' }, { status: 500 });
  }
}
