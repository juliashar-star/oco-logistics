-- CreateEnum
CREATE TYPE "CarrierConfirmWarning" AS ENUM ('REQUIREMENT_UNMET', 'PARCEL_MAY_NOT_FIT', 'ADDRESS_NOT_FOUND', 'ADDRESS_COORDINATE_MISMATCH', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "confirmWarnings" "CarrierConfirmWarning"[] DEFAULT ARRAY[]::"CarrierConfirmWarning"[];
