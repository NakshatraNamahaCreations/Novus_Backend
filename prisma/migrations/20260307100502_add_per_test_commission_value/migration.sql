-- AlterTable
ALTER TABLE "CenterCategoryCommissionTest" ADD COLUMN     "type" "CommissionType" NOT NULL DEFAULT 'PERCENT',
ADD COLUMN     "value" DOUBLE PRECISION NOT NULL DEFAULT 0;
