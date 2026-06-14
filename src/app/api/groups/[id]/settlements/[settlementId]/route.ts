import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { AuditAction } from '@prisma/client';

// DELETE /api/groups/[id]/settlements/[settlementId] - Delete a settlement payment
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; settlementId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId, settlementId } = await params;

    // Verify active membership
    const callerMember = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id, leftAt: null },
    });

    if (!callerMember) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member.' }, { status: 403 });
    }

    const settlementToDelete = await prisma.settlement.findFirst({
      where: { id: settlementId, groupId },
    });

    if (!settlementToDelete) {
      return NextResponse.json({ error: 'Settlement record not found.' }, { status: 404 });
    }

    // Delete settlement
    await prisma.settlement.delete({
      where: { id: settlementId },
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.SETTLEMENT_DELETE,
      entityName: 'Settlement',
      entityId: settlementId,
      oldValues: {
        ...settlementToDelete,
        amount: Number(settlementToDelete.amount) / 100,
      },
    });

    return NextResponse.json({ message: 'Settlement payment deleted successfully.' });
  } catch (error) {
    console.error('DELETE settlement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
