-- CreateTable
CREATE TABLE "CarrierCredential" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "credentialsEnc" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarrierCredential_companyId_idx" ON "CarrierCredential"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierCredential_companyId_providerKey_key" ON "CarrierCredential"("companyId", "providerKey");

-- AddForeignKey
ALTER TABLE "CarrierCredential" ADD CONSTRAINT "CarrierCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
