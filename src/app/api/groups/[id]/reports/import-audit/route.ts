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

    // Verify caller membership in group
    const callerMembership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: session.user.id },
    });

    if (!callerMembership) {
      return NextResponse.json({ error: 'Forbidden. You do not belong to this group.' }, { status: 403 });
    }

    // Fetch all import jobs for the group
    const importJobs = await prisma.importJob.findMany({
      where: { groupId },
      include: {
        user: { select: { name: true, email: true } },
        anomalies: {
          select: {
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Map each job to summarized staging statistics
    const summarizedJobs = importJobs.map((job) => {
      const anomalies = job.anomalies;
      const totalAnomalies = anomalies.length;
      const resolved = anomalies.filter(a => a.status === 'RESOLVED').length;
      const overridden = anomalies.filter(a => a.status === 'OVERRIDDEN').length;
      const skipped = anomalies.filter(a => a.status === 'SKIPPED').length;
      const unresolved = anomalies.filter(a => a.status === 'UNRESOLVED').length;

      return {
        id: job.id,
        fileName: job.fileName,
        status: job.status,
        uploadedBy: job.user.name || job.user.email,
        uploadedAt: job.createdAt.toISOString(),
        rowCount: job.rowCount,
        anomaliesCount: totalAnomalies,
        resolvedCount: resolved,
        overriddenCount: overridden,
        skippedCount: skipped,
        unresolvedCount: unresolved,
      };
    });

    return NextResponse.json({ jobs: summarizedJobs });
  } catch (error) {
    console.error('GET import-audit report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
