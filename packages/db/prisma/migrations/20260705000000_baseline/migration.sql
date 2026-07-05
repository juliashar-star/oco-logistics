-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('FASHION', 'BEAUTY', 'WELLNESS', 'PET', 'OTHER');

-- CreateEnum
CREATE TYPE "PickupType" AS ENUM ('COURIER', 'PVZ');

-- CreateEnum
CREATE TYPE "SelectionMode" AS ENUM ('FAST', 'CHEAP', 'OPTIMAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'CREATED', 'IN_TRANSIT', 'AT_PVZ', 'DELIVERED', 'RETURNED', 'CANCELED', 'PROBLEM');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inn" TEXT,
    "contactEmail" TEXT NOT NULL,
    "senderCity" TEXT,
    "senderAddress" TEXT,
    "senderPhone" TEXT,
    "apishipLogin" TEXT,
    "apishipPasswordEnc" TEXT,
    "apishipConnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "warehouseAddress" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "verificationTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrier" (
    "id" TEXT NOT NULL,
    "apishipCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "category" "ProductCategory" NOT NULL DEFAULT 'OTHER',
    "weightG" INTEGER NOT NULL,
    "lengthCm" INTEGER NOT NULL,
    "widthCm" INTEGER NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "declaredValue" INTEGER,
    "destCity" TEXT NOT NULL,
    "destAddress" TEXT,
    "pvzCode" TEXT,
    "pickupType" "PickupType" NOT NULL DEFAULT 'PVZ',
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "carrierId" TEXT,
    "selectionMode" "SelectionMode",
    "serviceCode" TEXT,
    "plannedCost" INTEGER,
    "plannedDeliveryDays" INTEGER,
    "plannedDeliveryDate" TIMESTAMP(3),
    "actualCost" INTEGER,
    "pickedUpAt" TIMESTAMP(3),
    "arrivedAtPvzAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "isOnTime" BOOLEAN,
    "isReturned" BOOLEAN NOT NULL DEFAULT false,
    "isCanceled" BOOLEAN NOT NULL DEFAULT false,
    "returnReason" TEXT,
    "apishipOrderId" TEXT,
    "trackNumber" TEXT,
    "labelUrl" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "legalBasisConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffQuote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "shipmentId" TEXT,
    "carrierId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "deliveryDaysMin" INTEGER,
    "deliveryDaysMax" INTEGER,
    "pickupType" "PickupType" NOT NULL,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TariffQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "statusCode" TEXT NOT NULL,
    "statusText" TEXT NOT NULL,
    "location" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierScore" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "category" "ProductCategory",
    "region" TEXT,
    "onTimeRate" DOUBLE PRECISION NOT NULL,
    "returnRate" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarrierScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_verificationToken_key" ON "User"("verificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_apishipCode_key" ON "Carrier"("apishipCode");

-- CreateIndex
CREATE INDEX "Shipment_companyId_status_idx" ON "Shipment"("companyId", "status");

-- CreateIndex
CREATE INDEX "Shipment_companyId_createdAt_idx" ON "Shipment"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_trackNumber_idx" ON "Shipment"("trackNumber");

-- CreateIndex
CREATE INDEX "TariffQuote_shipmentId_idx" ON "TariffQuote"("shipmentId");

-- CreateIndex
CREATE INDEX "TariffQuote_carrierId_idx" ON "TariffQuote"("carrierId");

-- CreateIndex
CREATE INDEX "TariffQuote_companyId_idx" ON "TariffQuote"("companyId");

-- CreateIndex
CREATE INDEX "TrackingEvent_shipmentId_idx" ON "TrackingEvent"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingEvent_shipmentId_statusCode_eventAt_key" ON "TrackingEvent"("shipmentId", "statusCode", "eventAt");

-- CreateIndex
CREATE INDEX "CarrierScore_carrierId_idx" ON "CarrierScore"("carrierId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_bucket_key_key" ON "RateLimitBucket"("bucket", "key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffQuote" ADD CONSTRAINT "TariffQuote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffQuote" ADD CONSTRAINT "TariffQuote_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffQuote" ADD CONSTRAINT "TariffQuote_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierScore" ADD CONSTRAINT "CarrierScore_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
