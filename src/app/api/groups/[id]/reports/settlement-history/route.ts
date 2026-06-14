import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { AuditAction } from '@prisma/client';

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

    // Verify caller membership in group
    const callerMembership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id },
    });

    if (!callerMembership) {
      return NextResponse.json({ error: 'Forbidden. You do not belong to this group.' }, { status: 403 });
    }

    // Get group members for mapping user IDs to names
    const members = await prisma.groupMembership.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    const memberMap = new Map(members.map(m => [m.userId, m.user]));

    // Fetch active settlements
    const activeSettlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        payee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { date: 'desc' },
    });

    // Fetch deleted settlements from AuditLog
    const deletedLogs = await prisma.auditLog.findMany({
      where: {
        action: AuditAction.SETTLEMENT_DELETE,
        entityName: 'Settlement',
      },
      include: {
        user: { select: { name: true, email: true } }, // user who performed the deletion
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter audit logs for this specific group and construct report items
    const deletedSettlements = deletedLogs
      .filter((log) => {
        const oldVal = log.oldValues as any;
        return oldVal && oldVal.groupId === groupId;
      })
      .map((log) => {
        const oldVal = log.oldValues as any;
        
        // Lookup names
        const payerUser = memberMap.get(oldVal.payerId);
        const payeeUser = memberMap.get(oldVal.payeeId);

        return {
          id: oldVal.id || log.entityId,
          date: oldVal.date ? new Date(oldVal.date).toISOString() : log.createdAt.toISOString(),
          payerId: oldVal.payerId,
          payerName: payerUser?.name || payerUser?.email || 'Anonymous Payer',
          payerEmail: payerUser?.email || '',
          payeeId: oldVal.payeeId,
          payeeName: payeeUser?.name || payeeUser?.email || 'Anonymous Payee',
          payeeEmail: payeeUser?.email || '',
          amount: Number(oldVal.amount).toFixed(2), // note: delete route already divided by 100, but let's be careful
          currency: oldVal.currency || 'INR',
          createdAt: oldVal.createdAt ? new Date(oldVal.createdAt).toISOString() : log.createdAt.toISOString(),
          deletedAt: log.createdAt.toISOString(),
          deletedBy: log.user?.name || log.user?.email || 'System',
        };
      });

    const activeReport = activeSettlements.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      payerId: s.payerId,
      payerName: s.payer.name || s.payer.email,
      payerEmail: s.payer.email,
      payeeId: s.payeeId,
      payeeName: s.payee.name || s.payee.email,
      payeeEmail: s.payee.email,
      amount: (Number(s.amount) / 100).toFixed(2),
      currency: s.currency,
      createdAt: s.createdAt.toISOString(),
      deletedAt: null,
      deletedBy: null,
    }));

    // Combine and sort chronologically by date
    const allSettlements = [...activeReport, ...deletedSettlements].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return NextResponse.json({ settlements: allSettlements });
  } catch (error) {
    console.error('GET settlement-history report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
