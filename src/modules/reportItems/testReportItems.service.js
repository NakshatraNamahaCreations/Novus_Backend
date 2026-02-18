import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const TestReportItemService = {
  listByTest: async (testId) => {
    return prisma.testReportItem.findMany({
      where: { testId: Number(testId) },
      orderBy: { sortOrder: "asc" },
      include: {
        parameter: true, // so UI can show parameter name for PARAMETER items
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  },

  create: async (testId, data) => {
    const tId = Number(testId);
    const createdById = data.createdById ? Number(data.createdById) : null;

    // auto sortOrder = last + 1
    const max = await prisma.testReportItem.aggregate({
      where: { testId: tId },
      _max: { sortOrder: true },
    });
    const nextSort = (max._max.sortOrder ?? 0) + 1;

    return prisma.testReportItem.create({
      data: {
        testId: tId,
        type: data.type, // HEADING / NOTES / RICH_TEXT / PARAMETER
        sortOrder: data.sortOrder != null ? Number(data.sortOrder) : nextSort,
        title: data.title ?? null,
        text: data.text ?? null,
        html: data.html ?? null,
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
        html: data.html ?? undefined,
        sortOrder: data.sortOrder != null ? Number(data.sortOrder) : undefined,
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
        }),
      ),
    );
  },
};
