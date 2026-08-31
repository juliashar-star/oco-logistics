/*
  Warnings:

  - You are about to drop the column `altPriceRub` on the `ShipmentDecision` table. All the data in the column will be lost.
  - You are about to drop the column `chosenPriceRub` on the `ShipmentDecision` table. All the data in the column will be lost.
  - Added the required column `chosenPriceKop` to the `ShipmentDecision` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ShipmentDecision" DROP COLUMN "altPriceRub",
DROP COLUMN "chosenPriceRub",
ADD COLUMN     "altPriceIsEstimate" BOOLEAN,
ADD COLUMN     "altPriceKop" INTEGER,
ADD COLUMN     "chosenPriceKop" INTEGER NOT NULL;
