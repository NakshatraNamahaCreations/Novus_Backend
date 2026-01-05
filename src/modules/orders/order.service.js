import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
import { reportQueue } from "../../queues/report.queue.js";

export const markOrderReportReady = async (order) => {


 
  // prevent duplicate generation
  if (!order.reportUrl) {
    console.log("order.reportUrl",order.reportUrl)
    await reportQueue.add("report.generate", {
      orderId: order.id
    });
  }

  return order;
};
