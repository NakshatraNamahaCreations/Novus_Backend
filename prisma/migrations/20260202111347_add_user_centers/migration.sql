-- CreateTable
CREATE TABLE "UserCenter" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "centerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserCenter_userId_idx" ON "UserCenter"("userId");

-- CreateIndex
CREATE INDEX "UserCenter_centerId_idx" ON "UserCenter"("centerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCenter_userId_centerId_key" ON "UserCenter"("userId", "centerId");

-- AddForeignKey
ALTER TABLE "UserCenter" ADD CONSTRAINT "UserCenter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCenter" ADD CONSTRAINT "UserCenter_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;
