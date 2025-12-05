import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const RangeService = {
  create: (parameterId, data) =>
    prisma.parameterRange.create({
      data: { ...data, parameterId: Number(parameterId) }
    }),

  update: (rangeId, data) =>
    prisma.parameterRange.update({
      where: { id: Number(rangeId) },
      data
    }),

  delete: (rangeId) =>
    prisma.parameterRange.delete({
      where: { id: Number(rangeId) }
    }),

  list: (parameterId) =>
    prisma.parameterRange.findMany({
      where: { parameterId: Number(parameterId) },
      orderBy: { id: "asc" }
    })
};
