import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

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
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    // Verify caller membership in group
    const callerMembership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id },
    });

    if (!callerMembership) {
      return NextResponse.json({ error: 'Forbidden. You do not belong to this group.' }, { status: 403 });
    }

    // Get the target user's details
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find all expenses in group where the target user is payer or participant
    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
        deletedAt: null,
        OR: [
          { payerId: userId },
          { participants: { some: { userId } } },
        ],
      },
      include: {
        payer: { select: { name: true, email: true } },
        participants: {
          where: { userId },
        },
      },
      orderBy: { date: 'desc' },
    });

    const reportExpenses = expenses.map((exp) => {
      const isPayer = exp.payerId === userId;
      const isParticipant = exp.participants.length > 0;
      
      let role: 'PAYER' | 'PARTICIPANT' | 'BOTH' = 'PARTICIPANT';
      if (isPayer && isParticipant) {
        role = 'BOTH';
      } else if (isPayer) {
        role = 'PAYER';
      }

      // Convert BigInt subunits to standard decimals for serializing
      const paidAmount = isPayer ? Number(exp.amount) / 100 : 0;
      const owedAmount = isParticipant ? Number(exp.participants[0].owedAmount) / 100 : 0;
      const netImpact = paidAmount - owedAmount;

      return {
        id: exp.id,
        date: exp.date.toISOString(),
        description: exp.description,
        amount: (Number(exp.amount) / 100).toFixed(2),
        currency: exp.currency,
        role,
        paidAmount: paidAmount.toFixed(2),
        owedAmount: owedAmount.toFixed(2),
        netImpact: netImpact.toFixed(2),
      };
    });

    return NextResponse.json({
      userId,
      userName: targetUser.name || 'Anonymous User',
      userEmail: targetUser.email,
      expenses: reportExpenses,
    });
  } catch (error) {
    console.error('GET member-ledger report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
