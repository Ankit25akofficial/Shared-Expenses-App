import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { calculateSplits } from '@/lib/splits';
import { createAuditLog } from '@/lib/audit';
import { AuditAction, SplitType } from '@prisma/client';
import { isValidCurrencyCode } from '@/lib/currency';

const participantSchema = z.object({
  userId: z.string(),
  splitValue: z.number(),
});

const createExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required').max(255),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().refine(val => isValidCurrencyCode(val), {
    message: 'Unsupported currency code. Supported currencies: INR, USD, EUR, GBP',
  }),
  date: z.string().datetime(), // ISO 8601 string
  payerId: z.string(),
  splitType: z.nativeEnum(SplitType),
  participants: z.array(participantSchema).min(1, 'At least one participant is required'),
});

// GET /api/groups/[id]/expenses - Fetch all non-deleted expenses in a group
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

    // Verify calling user belongs to this group
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden. You do not belong to this group.' }, { status: 403 });
    }

    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
        deletedAt: null, // filter out soft deleted ones
      },
      include: {
        payer: {
          select: { id: true, name: true, email: true },
        },
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Convert BigInt amounts to numbers for JSON serialization
    const serializedExpenses = expenses.map(exp => ({
      ...exp,
      amount: Number(exp.amount),
      participants: exp.participants.map(p => ({
        ...p,
        owedAmount: Number(p.owedAmount),
      })),
    }));

    return NextResponse.json({ expenses: serializedExpenses });
  } catch (error) {
    console.error('GET expenses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[id]/expenses - Create a new expense
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

    // Verify calling user is currently an active member of this group
    const callerMember = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id, leftAt: null },
    });

    if (!callerMember) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member.' }, { status: 403 });
    }

    const body = await request.json();
    const result = createExpenseSchema.safeParse(body);
    if (!result.success) {
      const errors = result.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const { description, amount, currency, date, payerId, splitType, participants } = result.data;
    
    const expenseDate = new Date(date);
    // Set check bounds to cover the entire calendar day in UTC
    const expenseDateStart = new Date(date);
    expenseDateStart.setUTCHours(0, 0, 0, 0);
    const expenseDateEnd = new Date(date);
    expenseDateEnd.setUTCHours(23, 59, 59, 999);

    // 1. Validate Temporal Membership for Payer & Participants
    const userIds = Array.from(new Set([payerId, ...participants.map(p => p.userId)]));
    
    for (const userId of userIds) {
      const activeAtDate = await prisma.groupMembership.findFirst({
        where: {
          groupId,
          userId,
          joinedAt: { lte: expenseDateEnd },
          OR: [
            { leftAt: null },
            { leftAt: { gte: expenseDateStart } },
          ],
        },
      });

      if (!activeAtDate) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        });
        const userName = user?.name || user?.email || userId;
        return NextResponse.json({
          error: `Membership Violation: ${userName} was not an active member of the group on the expense date (${expenseDate.toLocaleDateString()}).`,
        }, { status: 400 });
      }
    }

    // 2. Convert raw floating-point amount to integer paise/cents (BigInt)
    // We round to 2 decimal places and multiply by 100 to get the integer subunit representation
    const totalSubunits = BigInt(Math.round(amount * 100));

    // 3. Calculate splits
    let splitResults;
    try {
      splitResults = calculateSplits(totalSubunits, splitType, participants);
    } catch (splitErr: any) {
      return NextResponse.json({ error: splitErr.message }, { status: 400 });
    }

    // 4. Save to Database inside a single Transaction
    const expense = await prisma.$transaction(async (tx) => {
      const newExpense = await tx.expense.create({
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

      // Bulk create participants
      await tx.expenseParticipant.createMany({
        data: splitResults.map(p => ({
          expenseId: newExpense.id,
          userId: p.userId,
          owedAmount: p.owedAmount,
          splitValue: p.splitValue,
        })),
      });

      return newExpense;
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.EXPENSE_CREATE,
      entityName: 'Expense',
      entityId: expense.id,
      newValues: {
        ...expense,
        amount: Number(expense.amount),
        participants: splitResults.map(p => ({
          userId: p.userId,
          owedAmount: Number(p.owedAmount),
          splitValue: p.splitValue,
        })),
      },
    });

    return NextResponse.json({
      message: 'Expense created successfully.',
      expense: {
        ...expense,
        amount: Number(expense.amount),
      },
    }, { status: 201 });

  } catch (error) {
    console.error('POST expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
