import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const DEFAULTS = {
  baseAmount: 0,
  perKmRate: 0,
  thresholdDistance: 0,
  bonusForFiveStar: 0,
  isActive: true,
};

export const ConfigService = {
  // -----------------------------
  // GLOBAL DEFAULT (vendorId = null)
  // -----------------------------
  getGlobalConfig: async () => {
    let config = await prisma.vendorEarningConfig.findFirst({
      where: { vendorId: null },
    });

    if (!config) {
      config = await prisma.vendorEarningConfig.create({
        data: { ...DEFAULTS, vendorId: null },
      });
    }

    return config;
  },

  updateGlobalConfig: async (data) => {
    // ensure a global config exists
    const existing = await prisma.vendorEarningConfig.findFirst({
      where: { vendorId: null },
    });

    if (!existing) {
      return prisma.vendorEarningConfig.create({
        data: { ...DEFAULTS, ...data, vendorId: null },
      });
    }

    return prisma.vendorEarningConfig.update({
      where: { id: existing.id },
      data: { ...data },
    });
  },

  // -----------------------------
  // VENDOR SPECIFIC (vendorId = X)
  // -----------------------------
  getVendorConfig: async (vendorId) => {
    // 1) Try vendor override
    const vendorConfig = await prisma.vendorEarningConfig.findFirst({
      where: { vendorId, isActive: true },
    });

    if (vendorConfig) return vendorConfig;

    // 2) fallback to global
    return ConfigService.getGlobalConfig();
  },

  upsertVendorConfig: async (vendorId, data) => {
    // upsert based on vendorId unique
    return prisma.vendorEarningConfig.upsert({
      where: { vendorId }, // vendorId must be @unique in schema
      create: {
        ...DEFAULTS,
        ...data,
        vendorId,
      },
      update: {
        ...data,
      },
    });
  },

  disableVendorConfig: async (vendorId) => {
    // disables vendor override (will fallback to global)
    const existing = await prisma.vendorEarningConfig.findFirst({
      where: { vendorId },
    });
    if (!existing) return null;

    return prisma.vendorEarningConfig.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  },
};
