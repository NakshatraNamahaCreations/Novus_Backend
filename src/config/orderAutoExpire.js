import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const startOrderExpiryJob = () => {
  setInterval(async () => {
    const now = new Date();

    const expiredOrders = await prisma.order.updateMany({
      where: {
        assignmentStatus: "waiting",
        createdAt: {
          lt: new Date(now.getTime() - 30 * 60 * 1000)
        }
      },
      data: {
        assignmentStatus: "expired"
      }
    });

    if (expiredOrders.count > 0) {
      console.log(`⛔ ${expiredOrders.count} orders expired`);
    }
  }, 60 * 1000); // runs every 1 minute
};
