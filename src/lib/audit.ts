import prisma from './prisma';
import { AuditAction } from '@prisma/client';

interface CreateAuditLogParams {
  userId?: string | null;
  action: AuditAction;
  entityName: string;
  entityId: string;
  oldValues?: any;
  newValues?: any;
}

export async function createAuditLog({
  userId,
  action,
  entityName,
  entityId,
  oldValues,
  newValues,
}: CreateAuditLogParams) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entityName,
        entityId,
        oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : null,
        newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : null,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // In production, we don't want audit failures to block critical transactions,
    // but in strict audit mode, we can either throw or log it. We will log it.
  }
}
