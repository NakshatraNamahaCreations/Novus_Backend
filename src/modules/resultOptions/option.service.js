import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const OptionService = {
  create: (parameterId, data) =>
    prisma.resultOption.create({
      data: { ...data, parameterId: Number(parameterId) }
    }),

  list: (parameterId) =>
    prisma.resultOption.findMany({
      where: { parameterId: Number(parameterId) }
    }),

  delete: (id) =>
    prisma.resultOption.delete({
      where: { id: Number(id) }
    })
};
