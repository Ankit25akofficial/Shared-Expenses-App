import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { AuditAction, AnomalyStatus } from '@prisma/client';
import { createAuditLog } from '@/lib/audit';

// PUT /api/groups/[id]/imports/[jobId]/rows/[rowId] - Update a normalized row (resolve anomaly manually)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string; rowId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId, jobId, rowId } = await params;

    // Verify caller is active
    const member = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id, leftAt: null },
    });

    if (!member) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member.' }, { status: 403 });
    }

    // Check if the row exists and belongs to the correct job
    const row = await prisma.importRow.findFirst({
      where: { id: rowId, jobId, job: { groupId } },
    });

    if (!row) {
      return NextResponse.json({ error: 'Staged row not found.' }, { status: 404 });
    }

    const body = await request.json();
    const { normalizedExpense, skipRow } = body;

    const updatedRow = await prisma.$transaction(async (tx) => {
      // 1. If user chose to skip the row
      if (skipRow) {
        const uRow = await tx.importRow.update({
          where: { id: rowId },
          data: { status: AnomalyStatus.SKIPPED },
        });

        // Set all linked anomalies to skipped
        await tx.importAnomaly.updateMany({
          where: { rowId },
          data: { 
            status: AnomalyStatus.SKIPPED,
            reviewedById: session.user.id,
            actionTaken: 'Row skipped by user',
          },
        });

        return uRow;
      }

      // 2. Otherwise, update the normalized content and mark as resolved
      const uRow = await tx.importRow.update({
        where: { id: rowId },
        data: {
          normalizedExpense,
          status: AnomalyStatus.RESOLVED,
        },
      });

      // Mark all anomalies for this row as resolved
      await tx.importAnomaly.updateMany({
        where: { rowId },
        data: {
          status: AnomalyStatus.RESOLVED,
          reviewedById: session.user.id,
          actionTaken: 'Values manually overridden and corrected by user',
        },
      });

      return uRow;
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.IMPORT_ROW_RESOLVE,
      entityName: 'ImportRow',
      entityId: rowId,
      oldValues: row,
      newValues: updatedRow,
    });

    return NextResponse.json({
      message: 'Row resolved successfully.',
      row: updatedRow,
    });

  } catch (error) {
    console.error('PUT import row error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
