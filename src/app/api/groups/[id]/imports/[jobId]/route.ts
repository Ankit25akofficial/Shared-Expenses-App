import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { AuditAction, ImportJobStatus } from '@prisma/client';
import { createAuditLog } from '@/lib/audit';

// GET /api/groups/[id]/imports/[jobId] - Fetch import job details, rows, and anomalies
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId, jobId } = await params;

    // Verify caller is a member
    const member = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id },
    });

    if (!member) {
      return NextResponse.json({ error: 'Forbidden. You do not belong to this group.' }, { status: 403 });
    }

    const job = await prisma.importJob.findFirst({
      where: { id: jobId, groupId },
      include: {
        rows: {
          orderBy: { rowNumber: 'asc' },
          include: {
            anomalies: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Import job not found.' }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error('GET import job error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[id]/imports/[jobId] - Reject/Cancel an import job
export async function DELETE(
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

    const job = await prisma.importJob.findFirst({
      where: { id: jobId, groupId },
    });

    if (!job) {
      return NextResponse.json({ error: 'Import job not found.' }, { status: 404 });
    }

    // Delete job (cascades to ImportRow and ImportAnomaly in DB)
    await prisma.importJob.delete({
      where: { id: jobId },
    });

    // Audit action
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.IMPORT_JOB_PROCESS,
      entityName: 'ImportJob',
      entityId: jobId,
      oldValues: { ...job, status: ImportJobStatus.REJECTED },
    });

    return NextResponse.json({ message: 'Import job rejected and staging rows deleted.' });
  } catch (error) {
    console.error('DELETE import job error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
