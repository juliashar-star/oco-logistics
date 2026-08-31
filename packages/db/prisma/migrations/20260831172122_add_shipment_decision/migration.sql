-- CreateEnum
CREATE TYPE "DeadlineBasis" AS ENUM ('CALENDAR_DAY', 'INTERVAL');

-- CreateTable
CREATE TABLE "ShipmentDecision" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "rulesVersion" INTEGER NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "selectionMode" "SelectionMode",
    "chosenAdapterKey" TEXT NOT NULL,
    "chosenServiceName" TEXT,
    "chosenPriceRub" INTEGER NOT NULL,
    "chosenPriceIsEstimate" BOOLEAN NOT NULL,
    "chosenDeadlineDay" DATE,
    "chosenDeadlineBasis" "DeadlineBasis",
    "altAdapterKey" TEXT,
    "altPriceRub" INTEGER,
    "altDeadlineDay" DATE,
    "offersTotal" INTEGER NOT NULL,
    "carriersTotal" INTEGER NOT NULL,
    "attributionComplete" BOOLEAN NOT NULL,

    CONSTRAINT "ShipmentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentDecision_shipmentId_key" ON "ShipmentDecision"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentDecision_decidedAt_idx" ON "ShipmentDecision"("decidedAt");

-- CreateIndex
CREATE INDEX "ShipmentDecision_chosenAdapterKey_idx" ON "ShipmentDecision"("chosenAdapterKey");

-- AddForeignKey
ALTER TABLE "ShipmentDecision" ADD CONSTRAINT "ShipmentDecision_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
