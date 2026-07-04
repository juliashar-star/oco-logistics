import { prisma } from "@/lib/db";

export type LogAuditEventInput = {
  userId: string | null;
  companyId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
};

/** Writes one audit row. Never throws; failures are logged generically without payload. */
export async function logAuditEvent(input: LogAuditEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  } catch {
    console.error("audit log write failed", { action: input.action });
  }
}
