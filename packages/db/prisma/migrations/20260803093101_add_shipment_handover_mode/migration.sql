-- CreateEnum
CREATE TYPE "HandoverMode" AS ENUM ('COURIER', 'DROP_OFF');

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "handoverMode" "HandoverMode" NOT NULL DEFAULT 'DROP_OFF';
