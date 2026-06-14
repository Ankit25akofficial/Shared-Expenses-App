import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { AuditAction } from '@prisma/client';

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  defaultCurrency: z.string().min(3).max(3).default('INR'),
});

// GET /api/groups - List all groups for the authenticated user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get groups where the user has a membership
    const memberships = await prisma.groupMembership.findMany({
      where: { userId: session.user.id },
      include: {
        group: {
          include: {
            memberships: {
              include: {
                user: {
                  select: { id: true, name: true, email: true }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    const groups = memberships.map(m => m.group);

    return NextResponse.json({ groups });
  } catch (error) {
    console.error('GET groups error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups - Create a new group
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = createGroupSchema.safeParse(body);
    
    if (!result.success) {
      const errors = result.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const { name, description, defaultCurrency } = result.data;

    // Use a transaction to create the group and join the creator
    const group = await prisma.$transaction(async (tx) => {
      const newGroup = await tx.group.create({
        data: {
          name,
          description,
          defaultCurrency: defaultCurrency.toUpperCase(),
        },
      });

      // Join the creator immediately
      await tx.groupMembership.create({
        data: {
          groupId: newGroup.id,
          userId: session.user.id,
          joinedAt: new Date(),
        },
      });

      return newGroup;
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.GROUP_CREATE,
      entityName: 'Group',
      entityId: group.id,
      newValues: group,
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    console.error('POST group error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
