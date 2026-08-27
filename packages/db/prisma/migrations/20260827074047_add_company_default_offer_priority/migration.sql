-- CreateEnum
CREATE TYPE "OfferPriority" AS ENUM ('CHEAPEST', 'FASTEST');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "defaultOfferPriority" "OfferPriority";
