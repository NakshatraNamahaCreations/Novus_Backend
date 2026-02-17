import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    // Fetch all tests with their category departmentItemId
    const tests = await prisma.test.findMany({
      select: {
        id: true,
        categoryId: true,
        departmentItemId: true,
        category: { select: { departmentItemId: true } },
      },
    });

    let updated = 0;
    let skipped = 0;

    for (const t of tests) {
      try {
        // already set → skip
        if (t.departmentItemId) {
          skipped++;
          continue;
        }

        const deptId = t.category?.departmentItemId || null;

        // if category has no department → skip (or keep null)
        if (!deptId) {
          skipped++;
          continue;
        }

        await prisma.test.update({
          where: { id: t.id },
          data: { departmentItemId: deptId },
        });

        updated++;
      } catch (err) {
        console.error(`Failed updating testId=${t.id}`, err);
      }
    }

    console.log(`✅ Backfill done. Updated=${updated}, Skipped=${skipped}`);
  } catch (error) {
    console.error("❌ Backfill failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
