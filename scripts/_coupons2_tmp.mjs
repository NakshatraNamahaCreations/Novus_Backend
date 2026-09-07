import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: process.env.PROD_URL } } });
try {
  await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");
  const coupons = await prisma.coupon.findMany({ orderBy: { id: "desc" }, take: 15 });
  console.log("## Coupons:"); for (const c of coupons) console.log(" ", JSON.stringify(c));
  const usage = await prisma.couponUsage.findMany({ orderBy: { id: "desc" }, take: 10 });
  console.log("## CouponUsage rows (latest 10, total:", await prisma.couponUsage.count(), "):");
  for (const u of usage) console.log(" ", JSON.stringify(u));
} finally { await prisma.$disconnect(); }
