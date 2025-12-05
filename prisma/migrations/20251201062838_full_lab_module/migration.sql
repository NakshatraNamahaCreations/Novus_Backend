-- CreateTable
CREATE TABLE "Venue" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceCenter" (
    "id" SERIAL NOT NULL,
    "shortCode" TEXT,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "address" TEXT,
    "email" TEXT,
    "altEmail" TEXT,
    "mobile" TEXT,
    "lat" DOUBLE PRECISION,
    "city" TEXT,
    "long" DOUBLE PRECISION,
    "billType" TEXT,
    "emailReportConfig" TEXT,
    "sendReportMail" BOOLEAN NOT NULL DEFAULT false,
    "sendBillMailToPatient" BOOLEAN NOT NULL DEFAULT false,
    "paymentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venueId" INTEGER NOT NULL,

    CONSTRAINT "ReferenceCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestParameter" (
    "id" SERIAL NOT NULL,
    "testId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "order" INTEGER,
    "unit" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParameterRange" (
    "id" SERIAL NOT NULL,
    "parameterId" INTEGER NOT NULL,
    "lowerLimit" DOUBLE PRECISION,
    "upperLimit" DOUBLE PRECISION,
    "criticalLow" DOUBLE PRECISION,
    "criticalHigh" DOUBLE PRECISION,
    "referenceRange" TEXT,
    "gender" TEXT,
    "normalValueHtml" TEXT,
    "specialConditionHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParameterRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultOption" (
    "id" SERIAL NOT NULL,
    "parameterId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,

    CONSTRAINT "ResultOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientTestResult" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "testId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "collectedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "reportedById" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientTestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParameterResult" (
    "id" SERIAL NOT NULL,
    "patientTestResultId" INTEGER NOT NULL,
    "parameterId" INTEGER NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "unit" TEXT,
    "flag" TEXT,
    "normalRangeText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParameterResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venue_name_key" ON "Venue"("name");

-- AddForeignKey
ALTER TABLE "ReferenceCenter" ADD CONSTRAINT "ReferenceCenter_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestParameter" ADD CONSTRAINT "TestParameter_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParameterRange" ADD CONSTRAINT "ParameterRange_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultOption" ADD CONSTRAINT "ResultOption_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTestResult" ADD CONSTRAINT "PatientTestResult_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTestResult" ADD CONSTRAINT "PatientTestResult_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParameterResult" ADD CONSTRAINT "ParameterResult_patientTestResultId_fkey" FOREIGN KEY ("patientTestResultId") REFERENCES "PatientTestResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParameterResult" ADD CONSTRAINT "ParameterResult_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
