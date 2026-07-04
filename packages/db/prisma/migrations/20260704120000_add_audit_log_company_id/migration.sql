-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "companyId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");
