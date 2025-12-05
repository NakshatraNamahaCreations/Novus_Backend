import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const ParameterService = {
  create: async (testId, data) => {
    return prisma.testParameter.create({
      data: { ...data, testId: Number(testId) }
    });
  },

  update: async (parameterId, data) => {
    return prisma.testParameter.update({
      where: { id: Number(parameterId) },
      data
    });
  },

  delete: async (parameterId) => {
    return prisma.testParameter.delete({
      where: { id: Number(parameterId) }
    });
  },

  listByTest: async (testId) => {
    return prisma.testParameter.findMany({
      where: { testId: Number(testId) },
      orderBy: { order: "asc" },
      include: {
        ranges: true,
        resultOpts: true
      }
    });
  }
};
