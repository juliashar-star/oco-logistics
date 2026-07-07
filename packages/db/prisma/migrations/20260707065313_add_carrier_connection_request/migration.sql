-- CreateTable
CREATE TABLE "CarrierConnectionRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarrierConnectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarrierConnectionRequest_companyId_idx" ON "CarrierConnectionRequest"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierConnectionRequest_companyId_providerKey_key" ON "CarrierConnectionRequest"("companyId", "providerKey");

-- AddForeignKey
ALTER TABLE "CarrierConnectionRequest" ADD CONSTRAINT "CarrierConnectionRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
