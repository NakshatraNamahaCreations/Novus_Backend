import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const ConfigService = {
  getConfig: async () => {
    let config = await prisma.vendorEarningConfig.findFirst();

    if (!config) {
      config = await prisma.vendorEarningConfig.create({
        data: {
          baseAmount: 0,
          perKmRate: 0,
          thresholdDistance: 0,
          bonusForFiveStar: 0
        }
      });
    }

    return config;
  },

  updateConfig: async (data) => {
    let config = await prisma.vendorEarningConfig.findFirst();

    if (!config) {
      // Create first-time config
      config = await prisma.vendorEarningConfig.create({ data });
      return config;
    }

    // Update existing config
    return prisma.vendorEarningConfig.update({
      where: { id: config.id },
      data
    });
  }
};
