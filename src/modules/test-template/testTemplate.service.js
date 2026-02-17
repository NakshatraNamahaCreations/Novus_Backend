import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * Block Types you will send from UI buttons:
 * TEST_HEADING, NOTES, RICH_TEXT, FREE_TEXT, TABLE_FORMAT, ANTIBIOTIC_LIST, HTML_TABLE_PARAMETER, TEMPLATE_CONTENT
 */

const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const cleanStr = (v) => {
  const s = (v ?? "").toString();
  const t = s.trim();
  return t.length ? t : null;
};

const safeGenderScope = (v) => {
  const g = (v || "ALL").toString().trim().toUpperCase();
  const allowed = new Set(["ALL", "MALE", "FEMALE", "OTHER"]);
  return allowed.has(g) ? g : "ALL";
};

export const TestTemplateService = {
  ensureTemplate: async (testId, data = {}) => {
    const tId = Number(testId);
    const createdById = data?.createdById ?? null;

    return prisma.testTemplate.upsert({
      where: { testId: tId },
      update: {},
      create: {
        testId: tId,
        name: "Default Template",
        createdById,
      },
      include: { blocks: true },
    });
  },

  createBlock: async (testId, data) => {
    const tId = Number(testId);

    const {
      type,            // required
      title,
      text,
      html,
      data: jsonData,
      settings,
      sortOrder,
      genderScope,     // ALL/MALE/FEMALE/OTHER
      createdById,
      parameterIds,    // optional for PARAMETERS/MULTI_PARAMETERS blocks
    } = data || {};

    // 1) Ensure template exists
    const template = await prisma.testTemplate.upsert({
      where: { testId: tId },
      update: {},
      create: {
        testId: tId,
        name: "Default Template",
        createdById: createdById ?? null,
      },
      select: { id: true },
    });

    // 2) Create block
    return prisma.testTemplateBlock.create({
      data: {
        templateId: template.id,
        type, // must match enum
        title: cleanStr(title),
        text: cleanStr(text),
        html: cleanStr(html),
        data: jsonData ?? undefined,
        settings: settings ?? undefined,
        sortOrder: toInt(sortOrder, 0),
        genderScope: safeGenderScope(genderScope),
        createdById: createdById ?? null,

        blockParameters:
          Array.isArray(parameterIds) && parameterIds.length
            ? {
                create: parameterIds.map((pid, idx) => ({
                  parameterId: Number(pid),
                  sortOrder: idx,
                })),
              }
            : undefined,
      },
      include: { blockParameters: true },
    });
  },

  updateBlock: async (blockId, data) => {
    const id = Number(blockId);

    const {
      title,
      text,
      html,
      data: jsonData,
      settings,
      sortOrder,
      genderScope,
      isActive,
      parameterIds, // if you want to replace linked params
    } = data || {};

    return prisma.$transaction(async (tx) => {
      // update main fields
      await tx.testTemplateBlock.update({
        where: { id },
        data: {
          title: title !== undefined ? cleanStr(title) : undefined,
          text: text !== undefined ? cleanStr(text) : undefined,
          html: html !== undefined ? cleanStr(html) : undefined,
          data: jsonData !== undefined ? jsonData : undefined,
          settings: settings !== undefined ? settings : undefined,
          sortOrder: sortOrder !== undefined ? toInt(sortOrder, 0) : undefined,
          genderScope: genderScope !== undefined ? safeGenderScope(genderScope) : undefined,
          isActive: isActive !== undefined ? !!isActive : undefined,
        },
      });

      // replace linked params if provided
      if (parameterIds !== undefined) {
        await tx.testTemplateBlockParameter.deleteMany({
          where: { blockId: id },
        });

        if (Array.isArray(parameterIds) && parameterIds.length) {
          await tx.testTemplateBlockParameter.createMany({
            data: parameterIds.map((pid, idx) => ({
              blockId: id,
              parameterId: Number(pid),
              sortOrder: idx,
            })),
          });
        }
      }

      return tx.testTemplateBlock.findUnique({
        where: { id },
        include: { blockParameters: true },
      });
    });
  },

  deleteBlock: async (blockId) => {
    // you can soft delete also: update isActive=false
    return prisma.testTemplateBlock.delete({
      where: { id: Number(blockId) },
    });
  },

  listBlocksByTest: async (testId, genderScope = "ALL") => {
    const tId = Number(testId);
    const g = safeGenderScope(genderScope);

    // If patient is MALE/FEMALE/OTHER => include blocks for ALL + specific
    const filter = g === "ALL" ? ["ALL"] : ["ALL", g];

    const template = await prisma.testTemplate.findUnique({
      where: { testId: tId },
      select: { id: true },
    });

    if (!template) return [];

    return prisma.testTemplateBlock.findMany({
      where: {
        templateId: template.id,
        isActive: true,
        genderScope: { in: filter },
      },
      orderBy: { sortOrder: "asc" },
      include: {
        blockParameters: { orderBy: { sortOrder: "asc" } },
      },
    });
  },

  reorderBlocks: async (testId, items = []) => {
    const tId = Number(testId);

    const template = await prisma.testTemplate.findUnique({
      where: { testId: tId },
      select: { id: true },
    });
    if (!template) throw new Error("Template not found");

    // items: [{id, sortOrder}]
    await prisma.$transaction(
      items.map((it) =>
        prisma.testTemplateBlock.update({
          where: { id: Number(it.id) },
          data: { sortOrder: toInt(it.sortOrder, 0) },
        }),
      ),
    );

    return true;
  },
};
