-- CreateTable
CREATE TABLE "VendorProfile" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "photoUrl" TEXT,
    "clinicName" TEXT,
    "specialization" TEXT,
    "experience" INTEGER,
    "qualification" TEXT,
    "bio" TEXT,

    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorProfile_vendorId_key" ON "VendorProfile"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
