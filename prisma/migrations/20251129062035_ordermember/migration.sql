-- AddForeignKey
ALTER TABLE "OrderMember" ADD CONSTRAINT "OrderMember_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
