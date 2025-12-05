-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
