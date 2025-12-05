-- CreateTable
CREATE TABLE "_CategoryToHealthPackage" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CategoryToHealthPackage_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CategoryToHealthPackage_B_index" ON "_CategoryToHealthPackage"("B");

-- AddForeignKey
ALTER TABLE "_CategoryToHealthPackage" ADD CONSTRAINT "_CategoryToHealthPackage_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToHealthPackage" ADD CONSTRAINT "_CategoryToHealthPackage_B_fkey" FOREIGN KEY ("B") REFERENCES "Checkup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
