import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { calculateSplits } from '@/lib/splits';
import { createAuditLog } from '@/lib/audit';
import { AuditAction, SplitType } from '@prisma/client';

const participantSchema = z.object({
  userId: z.string(),
  splitValue: z.number(),
});

const updateExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required').max(255),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().min(3).max(3),
  date: z.string().datetime(),
  payerId: z.string(),
  splitType: z.nativeEnum(SplitType),
  participants: z.array(participantSchema).min(1, 'At least one participant is required'),
});

// GET /api/groups/[id]/expenses/[expenseId] - Fetch single expense details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId, expenseId } = await params;

    // Verify user belongs to the group
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden. You do not belong to this group.' }, { status: 403 });
    }

    const expense = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        groupId,
        deletedAt: null,
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
    });

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found.' }, { status: 404 });
    }

    const serializedExpense = {
      ...expense,
      amount: Number(expense.amount),
      participants: expense.participants.map(p => ({
        ...p,
        owedAmount: Number(p.owedAmount),
      })),
    };

    return NextResponse.json({ expense: serializedExpense });
  } catch (error) {
    console.error('GET expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/groups/[id]/expenses/[expenseId] - Edit an expense
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId, expenseId } = await params;

    // Verify active membership
    const callerMember = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id, leftAt: null },
    });

    if (!callerMember) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member.' }, { status: 403 });
    }

    const expenseToEdit = await prisma.expense.findFirst({
      where: { id: expenseId, groupId, deletedAt: null },
      include: { participants: true },
    });

    if (!expenseToEdit) {
      return NextResponse.json({ error: 'Expense not found.' }, { status: 404 });
    }

    const body = await request.json();
    const result = updateExpenseSchema.safeParse(body);
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

    // 1. Validate Temporal Membership for Payer & Participants on the new date
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
          error: `Membership Violation: ${userName} was not an active member on the expense date (${expenseDate.toLocaleDateString()}).`,
        }, { status: 400 });
      }
    }

    // 2. Convert amount to integer cents/paise
    const totalSubunits = BigInt(Math.round(amount * 100));

    // 3. Re-calculate splits
    let splitResults;
    try {
      splitResults = calculateSplits(totalSubunits, splitType, participants);
    } catch (splitErr: any) {
      return NextResponse.json({ error: splitErr.message }, { status: 400 });
    }

    // 4. Update Database inside a single Transaction
    const updatedExpense = await prisma.$transaction(async (tx) => {
      // Update primary expense settings
      const updated = await tx.expense.update({
        where: { id: expenseId },
        data: {
          description,
          amount: totalSubunits,
          currency: currency.toUpperCase(),
          date: expenseDate,
          payerId,
          splitType,
        },
      });

      // Clear existing participants and recreate them
      await tx.expenseParticipant.deleteMany({
        where: { expenseId },
      });

      await tx.expenseParticipant.createMany({
        data: splitResults.map(p => ({
          expenseId,
          userId: p.userId,
          owedAmount: p.owedAmount,
          splitValue: p.splitValue,
        })),
      });

      return updated;
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.EXPENSE_UPDATE,
      entityName: 'Expense',
      entityId: expenseId,
      oldValues: {
        ...expenseToEdit,
        amount: Number(expenseToEdit.amount),
        participants: expenseToEdit.participants.map(p => ({
          userId: p.userId,
          owedAmount: Number(p.owedAmount),
          splitValue: Number(p.splitValue),
        })),
      },
      newValues: {
        ...updatedExpense,
        amount: Number(updatedExpense.amount),
        participants: splitResults.map(p => ({
          userId: p.userId,
          owedAmount: Number(p.owedAmount),
          splitValue: p.splitValue,
        })),
      },
    });

    return NextResponse.json({
      message: 'Expense updated successfully.',
      expense: {
        ...updatedExpense,
        amount: Number(updatedExpense.amount),
      },
    });

  } catch (error) {
    console.error('PUT expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[id]/expenses/[expenseId] - Soft delete an expense
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId, expenseId } = await params;

    // Verify active membership
    const callerMember = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id, leftAt: null },
    });

    if (!callerMember) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member.' }, { status: 403 });
    }

    const expenseToDelete = await prisma.expense.findFirst({
      where: { id: expenseId, groupId, deletedAt: null },
    });

    if (!expenseToDelete) {
      return NextResponse.json({ error: 'Expense not found.' }, { status: 404 });
    }

    // Set deletedAt for soft delete
    const softDeleted = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        deletedAt: new Date(),
      },
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.EXPENSE_DELETE,
      entityName: 'Expense',
      entityId: expenseId,
      oldValues: {
        ...expenseToDelete,
        amount: Number(expenseToDelete.amount),
      },
      newValues: {
        ...softDeleted,
        amount: Number(softDeleted.amount),
      },
    });

    return NextResponse.json({ message: 'Expense deleted successfully.' });
  } catch (error) {
    console.error('DELETE expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
