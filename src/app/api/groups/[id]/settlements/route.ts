import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { calculateGroupBalances } from '@/lib/balances';
import { AuditAction } from '@prisma/client';

import { isValidCurrencyCode } from '@/lib/currency';

const createSettlementSchema = z.object({
  payerId: z.string(),
  payeeId: z.string(),
  amount: z.number().positive('Settlement amount must be positive'),
  currency: z.string().refine(val => isValidCurrencyCode(val), {
    message: 'Unsupported currency code. Supported currencies: INR, USD, EUR, GBP',
  }),
  date: z.string().datetime().optional().nullable(),
});

// GET /api/groups/[id]/settlements - Fetch all settlements recorded in a group
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

    // Verify membership
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden. You do not belong to this group.' }, { status: 403 });
    }

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        payee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { date: 'desc' },
    });

    // Convert BigInt amounts to standard numbers for JSON serialization
    const serializedSettlements = settlements.map(s => ({
      ...s,
      amount: Number(s.amount) / 100,
    }));

    return NextResponse.json({ settlements: serializedSettlements });
  } catch (error) {
    console.error('GET settlements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[id]/settlements - Record a new settlement
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

    // Verify active membership
    const callerMember = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id, leftAt: null },
    });

    if (!callerMember) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member.' }, { status: 403 });
    }

    const body = await request.json();
    const result = createSettlementSchema.safeParse(body);
    if (!result.success) {
      const errors = result.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const { payerId, payeeId, amount, currency, date } = result.data;
    const baseDate = date ? new Date(date) : new Date();
    const settlementDate = baseDate;
    
    // Set check bounds to cover the entire calendar day in UTC
    const settlementDateStart = new Date(baseDate);
    settlementDateStart.setUTCHours(0, 0, 0, 0);
    const settlementDateEnd = new Date(baseDate);
    settlementDateEnd.setUTCHours(23, 59, 59, 999);

    // 1. Prevent Self-settlement
    if (payerId === payeeId) {
      return NextResponse.json({ error: 'Validation Error: A user cannot record a settlement with themselves.' }, { status: 400 });
    }

    // 2. Validate Temporal Membership for Payer & Payee
    const checkUsers = [payerId, payeeId];
    for (const uid of checkUsers) {
      const activeAtDate = await prisma.groupMembership.findFirst({
        where: {
          groupId,
          userId: uid,
          joinedAt: { lte: settlementDateEnd },
          OR: [
            { leftAt: null },
            { leftAt: { gte: settlementDateStart } },
          ],
        },
      });

      if (!activeAtDate) {
        const user = await prisma.user.findUnique({
          where: { id: uid },
          select: { name: true, email: true },
        });
        const userName = user?.name || user?.email || uid;
        return NextResponse.json({
          error: `Membership Violation: ${userName} was not an active member on the settlement date (${settlementDate.toLocaleDateString()}).`,
        }, { status: 400 });
      }
    }

    // 3. Prevent over-settlements (Negative balance after settlement)
    const currentBalances = await calculateGroupBalances(groupId);
    const upperCurrency = currency.toUpperCase();
    
    if (currentBalances[upperCurrency]) {
      const payerLedger = currentBalances[upperCurrency].ledgers[payerId];
      if (payerLedger) {
        const netOwed = -payerLedger.netBalance; // negative net balance means they owe money
        
        // If payer has a positive balance (they are owed money), they shouldn't be paying out settlements!
        if (payerLedger.netBalance > 0) {
          return NextResponse.json({
            error: `Overpayment Protection: ${payerLedger.name || payerLedger.email} has a positive balance (+${payerLedger.netBalance}) and does not owe any money in ${upperCurrency}.`,
          }, { status: 400 });
        }

        // If amount exceeds outstanding net debt, reject
        if (amount > netOwed + 0.005) { // allow small float buffer
          return NextResponse.json({
            error: `Overpayment Protection: Settlement amount (${upperCurrency} ${amount}) exceeds the total outstanding debt (${upperCurrency} ${netOwed.toFixed(2)}) for this member.`,
          }, { status: 400 });
        }
      }
    }

    // Convert amount to BigInt cents/paise
    const amountSubunits = BigInt(Math.round(amount * 100));

    // Create the settlement
    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        payerId,
        payeeId,
        amount: amountSubunits,
        currency: upperCurrency,
        date: settlementDate,
      },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        payee: { select: { id: true, name: true, email: true } },
      },
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.SETTLEMENT_CREATE,
      entityName: 'Settlement',
      entityId: settlement.id,
      newValues: {
        ...settlement,
        amount: Number(settlement.amount) / 100,
      },
    });

    return NextResponse.json({
      message: 'Settlement recorded successfully.',
      settlement: {
        ...settlement,
        amount: Number(settlement.amount) / 100,
      },
    }, { status: 201 });

  } catch (error) {
    console.error('POST settlement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
