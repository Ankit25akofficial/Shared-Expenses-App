import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { AuditAction } from '@prisma/client';

const updateGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  defaultCurrency: z.string().min(3).max(3),
});

// GET /api/groups/[id] - Fetch group details, members, and membership history
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if the user is a member of the group (currently or historically)
    const membership = await prisma.groupMembership.findFirst({
      where: {
        groupId: id,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden. You are not a member of this group.' }, { status: 403 });
    }

    // Fetch group details along with membership history
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error('GET group details error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/groups/[id] - Edit group settings
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify calling user is currently an active member of the group
    const activeMember = await prisma.groupMembership.findFirst({
      where: {
        groupId: id,
        userId: session.user.id,
        leftAt: null, // must be active to edit group settings
      },
    });

    if (!activeMember) {
      return NextResponse.json({ error: 'Forbidden. You must be an active group member.' }, { status: 403 });
    }

    const body = await request.json();
    const result = updateGroupSchema.safeParse(body);
    if (!result.success) {
      const errors = result.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const oldGroup = await prisma.group.findUnique({ where: { id } });
    if (!oldGroup) {
      return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
    }

    const { name, description, defaultCurrency } = result.data;
    const updatedGroup = await prisma.group.update({
      where: { id },
      data: {
        name,
        description,
        defaultCurrency: defaultCurrency.toUpperCase(),
      },
    });

    // Audit settings change
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.GROUP_UPDATE,
      entityName: 'Group',
      entityId: id,
      oldValues: oldGroup,
      newValues: updatedGroup,
    });

    return NextResponse.json({ group: updatedGroup });
  } catch (error) {
    console.error('PUT group details error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[id] - Delete a group (Cascades to memberships, expenses, etc.)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify active membership
    const activeMember = await prisma.groupMembership.findFirst({
      where: {
        groupId: id,
        userId: session.user.id,
        leftAt: null,
      },
    });

    if (!activeMember) {
      return NextResponse.json({ error: 'Forbidden. You must be an active member to delete the group.' }, { status: 403 });
    }

    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
    }

    // Delete the group (cascade handles the rest in DB)
    await prisma.group.delete({ where: { id } });

    // Audit group deletion
    await createAuditLog({
      userId: session.user.id,
      action: AuditAction.GROUP_UPDATE,
      entityName: 'Group',
      entityId: id,
      oldValues: { ...group, deleted: true },
    });

    return NextResponse.json({ message: 'Group deleted successfully.' });
  } catch (error) {
    console.error('DELETE group error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
