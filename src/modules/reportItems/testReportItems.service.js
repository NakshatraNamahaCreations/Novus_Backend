import prisma from '../../lib/prisma.js';

const normalizeGender = (g) => {
  const x = String(g || "Both").trim().toLowerCase();
  if (x === "male" || x === "m") return "Male";
  if (x === "female" || x === "f") return "Female";
  return "Both";
};

const genderWhere = (gender) => ({
  OR: [
    { gender: null },
    { gender: { equals: "Both", mode: "insensitive" } },
    { gender: { equals: gender, mode: "insensitive" } },
  ],
});

export const TestReportItemService = {
  listByTest: async (testId) => {
    return prisma.testReportItem.findMany({
      where: { testId: Number(testId) },
      orderBy: { sortOrder: "asc" },
      include: {
        parameter: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  },

  // ✅ NEW: Full test + parameters(+ranges) + reportItems (gender wise)
  getFullByTest: async (testId, genderRaw) => {
    const tId = Number(testId);
    const gender = normalizeGender(genderRaw);

    const test = await prisma.test.findUnique({
      where: { id: tId },
      select: {
        id: true,
        name: true,
        testType: true,
        categoryId: true,
        subCategoryId: true,
        reportWithin: true,
        reportUnit: true,
        status: true,
        actualPrice: true,
        offerPrice: true,
      },
    });

    if (!test) throw new Error("Test not found");

    const [parameters, reportItems] = await Promise.all([
      // ✅ parameter list (keep original order)
      prisma.testParameter.findMany({
        where: { testId: tId },
        orderBy: { order: "asc" },
        include: {
          // ✅ ranges filtered by gender (null/Both/selected)
          ranges: {
            where: genderWhere(gender),
            orderBy: { id: "asc" },
          },
          resultOpts: { orderBy: { id: "asc" } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),

      // ✅ report structure in sortOrder (gender-wise)
      prisma.testReportItem.findMany({
        where: {
          testId: tId,
          ...genderWhere(gender),
        },
        orderBy: { sortOrder: "asc" },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          parameter: {
            include: {
              // ✅ if item is PARAMETER, include only allowed ranges
              ranges: {
                where: genderWhere(gender),
                orderBy: { id: "asc" },
              },
              resultOpts: { orderBy: { id: "asc" } },
            },
          },
        },
      }),
    ]);

    return { test, gender, parameters, reportItems };
  },

  create: async (testId, data) => {
    const tId = Number(testId);
    const createdById = data.createdById ? Number(data.createdById) : null;

    const max = await prisma.testReportItem.aggregate({
      where: { testId: tId },
      _max: { sortOrder: true },
    });
    const nextSort = (max._max.sortOrder ?? 0) + 1;

    return prisma.testReportItem.create({
      data: {
        testId: tId,
        type: data.type,
        sortOrder: data.sortOrder != null ? Number(data.sortOrder) : nextSort,
        title: data.title ?? null,
        text: data.text ?? null,
        html: data.html ?? null,
        // ✅ save gender on item (Both/Male/Female)
        gender: data.gender ?? "Both",
        parameterId: data.parameterId != null ? Number(data.parameterId) : null,
        createdById,
      },
      include: { parameter: true },
    });
  },

  update: async (itemId, data) => {
    return prisma.testReportItem.update({
      where: { id: Number(itemId) },
      data: {
        title: data.title ?? undefined,
        text: data.text ?? undefined,
        // always write html when provided (null means clear it)
        html: "html" in data ? (data.html ?? null) : undefined,
        sortOrder: data.sortOrder != null ? Number(data.sortOrder) : undefined,
        gender: data.gender ?? undefined,
      },
      include: { parameter: true },
    });
  },

  remove: async (itemId) => {
    return prisma.testReportItem.delete({
      where: { id: Number(itemId) },
    });
  },

  reorder: async (testId, items) => {
    const tId = Number(testId);

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("items is required");
    }

    return prisma.$transaction(
      items.map((it) =>
        prisma.testReportItem.update({
          where: { id: Number(it.id) },
          data: { sortOrder: Number(it.sortOrder) },
        })
      )
    );
  },
};
