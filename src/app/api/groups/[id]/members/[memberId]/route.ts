import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { AuditAction } from '@prisma/client';

// DELETE /api/groups/[id]/members/[memberId] - Remove a member from a group (mark as left)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId, memberId } = await params;

    // Verify calling user is an active member of this group
    const callerMember = await prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId: session.user.id,
        leftAt: null,
      },
    });

    if (!callerMember) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member to remove others.' }, { status: 403 });
    }

    // Find the active membership record for the user to be removed
    const activeMembership = await prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId: memberId,
        leftAt: null,
      },
    });

    if (!activeMembership) {
      return NextResponse.json({ error: 'Member is not currently active in this group.' }, { status: 400 });
    }

    // Soft-leave: update leftAt field to current time
    const updatedMembership = await prisma.groupMembership.update({
      where: { id: activeMembership.id },
      data: {
        leftAt: new Date(),
      },
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.GROUP_MEMBERSHIP_CHANGE,
      entityName: 'GroupMembership',
      entityId: updatedMembership.id,
      newValues: { userId: memberId, removedBy: session.user.id, action: 'LEAVE' },
    });

    return NextResponse.json({
      message: 'Member removed successfully.',
      membership: updatedMembership,
    });
  } catch (error) {
    console.error('DELETE remove member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/groups/[id]/members/[memberId] - Edit membership dates (joinedAt, leftAt)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: groupId, memberId } = await params;

    // Verify calling user is an active member of this group
    const callerMember = await prisma.groupMembership.findFirst({
      where: {
        groupId,
        userId: session.user.id,
        leftAt: null,
      },
    });

    if (!callerMember) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member to edit membership.' }, { status: 403 });
    }

    // Find the latest membership record for this user in the group
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: memberId },
      orderBy: { joinedAt: 'desc' },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });
    }

    const body = await request.json();
    const { joinedAt, leftAt } = body;

    const updatedData: any = {};
    if (joinedAt) {
      updatedData.joinedAt = new Date(joinedAt);
    }
    if (leftAt !== undefined) {
      updatedData.leftAt = leftAt ? new Date(leftAt) : null;
    }

    const updated = await prisma.groupMembership.update({
      where: { id: membership.id },
      data: updatedData,
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    // Write audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.GROUP_MEMBERSHIP_CHANGE,
      entityName: 'GroupMembership',
      entityId: updated.id,
      newValues: { ...updatedData, userId: memberId, action: 'UPDATE' },
    });

    return NextResponse.json({ membership: updated });
  } catch (error) {
    console.error('PUT edit member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
