-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'SUBMITTING';

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "providerKey" TEXT,
ADD COLUMN     "providerOrderId" TEXT,
ADD COLUMN     "selectedOfferExpiresAt" TIMESTAMP(3),
ADD COLUMN     "selectedOfferId" TEXT,
ADD COLUMN     "submittingAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_companyId_idempotencyKey_key" ON "Shipment"("companyId", "idempotencyKey");
