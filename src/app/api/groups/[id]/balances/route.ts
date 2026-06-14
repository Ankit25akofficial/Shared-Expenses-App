import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { calculateGroupBalances } from '@/lib/balances';

// GET /api/groups/[id]/balances - Fetch group balances, netting path, and member logs
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

    // Verify user belongs to the group
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden. You do not belong to this group.' }, { status: 403 });
    }

    const balances = await calculateGroupBalances(groupId);

    return NextResponse.json({ balances });
  } catch (error: any) {
    console.error('GET group balances error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error occurred.' }, { status: 500 });
  }
}
