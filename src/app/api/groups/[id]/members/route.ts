import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { AuditAction } from '@prisma/client';

const addMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// POST /api/groups/[id]/members - Add a member to a group by email
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

    // Verify calling user is an active member of this group
    const callerMember = await prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId: session.user.id,
        leftAt: null,
      },
    });

    if (!callerMember) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member to add others.' }, { status: 403 });
    }

    const body = await request.json();
    const result = addMemberSchema.safeParse(body);
    if (!result.success) {
      const errors = result.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const { email } = result.data;
    const normalizedEmail = email.toLowerCase();

    // Find the user to add
    let userToAdd = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!userToAdd) {
      // Auto-provision user account with a placeholder name and dummy password
      const bcrypt = require('bcryptjs');
      const dummyPassword = Math.random().toString(36).slice(-10) + "Aa1!";
      const passwordHash = await bcrypt.hash(dummyPassword, 10);
      
      const emailName = normalizedEmail.split('@')[0];
      const displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1);

      userToAdd = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: displayName,
          passwordHash,
        },
      });
    }

    // Check if the user is already active in the group
    const activeMembership = await prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId: userToAdd.id,
        leftAt: null,
      },
    });

    if (activeMembership) {
      return NextResponse.json({ error: 'User is already an active member of this group.' }, { status: 400 });
    }

    // Create a new membership record (handles rejoining automatically by creating a fresh interval)
    const membership = await prisma.groupMembership.create({
      data: {
        groupId,
        userId: userToAdd.id,
        joinedAt: new Date(),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.GROUP_MEMBERSHIP_CHANGE,
      entityName: 'GroupMembership',
      entityId: membership.id,
      newValues: { userId: userToAdd.id, addedBy: session.user.id, action: 'JOIN' },
    });

    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    console.error('POST add member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
