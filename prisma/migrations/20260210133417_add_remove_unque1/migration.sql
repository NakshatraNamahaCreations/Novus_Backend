-- DropIndex
DROP INDEX "Doctor_email_key";

-- DropIndex
DROP INDEX "Doctor_number_key";

-- AlterTable
ALTER TABLE "Doctor" ALTER COLUMN "number" DROP NOT NULL;
