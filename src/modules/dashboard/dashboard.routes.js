import express from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const router = express.Router();

// Utility for % change formatting
const formatChange = (current, previous) => {
  if (!previous || previous === 0) return "+0%";
  const diff = ((current - previous) / previous) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}%`;
};


router.get("/kpi", async (req, res) => {
  try {
    const now = new Date();
    const monthAgo = new Date();
    monthAgo.setMonth(now.getMonth() - 1);

    // 1️⃣ Total Revenue (sum of finalAmount for paid orders)
    const totalRevenue = await prisma.order.aggregate({
      _sum: { finalAmount: true },
      // where: { paymentStatus: "paid" },
    });

    const lastMonthRevenue = await prisma.order.aggregate({
      _sum: { finalAmount: true },
      where: {
        // paymentStatus: "paid",
        createdAt: { gte: monthAgo, lte: now },
      },
    });

    // 2️⃣ Total Patients
    const totalPatients = await prisma.patient.count({
      where: { status: "active" },
    });
    const newPatients = await prisma.patient.count({
      where: { createdAt: { gte: monthAgo, lte: now } },
    });

    // 3️⃣ Total Vendors
    const totalVendors = await prisma.vendor.count({
      where: { block: false },
    });
    const newVendors = await prisma.vendor.count({
      where: { createdAt: { gte: monthAgo, lte: now } },
    });

    // 4️⃣ Total Orders
    const totalOrders = await prisma.order.count();
    const recentOrders = await prisma.order.count({
      where: { createdAt: { gte: monthAgo, lte: now } },
    });

    // Build response array
    const kpiData = [
      {
        title: "Revenue",
        value: `${(totalRevenue._sum.finalAmount || 0 / 1000).toFixed(1)}`,
        unit: "",
        change: formatChange(
          totalRevenue._sum.finalAmount || 0,
          lastMonthRevenue._sum.finalAmount || 0
        ),
        changeType:
          totalRevenue._sum.finalAmount >=
          (lastMonthRevenue._sum.finalAmount || 0)
            ? "positive"
            : "negative",
        icon: "Heart",
        color: "novus-green",
      },
      {
        title: "Patients",
        value: totalPatients.toString(),
        unit: "",
        change: formatChange(totalPatients, newPatients),
        changeType: newPatients > 0 ? "positive" : "negative",
        icon: "Building2",
        color: "medical-blue",
      },
      {
        title: "Vendors",
        value: totalVendors.toString(),
        unit: "",
        change: formatChange(totalVendors, newVendors),
        changeType: newVendors > 0 ? "positive" : "negative",
        icon: "Users",
        color: "warning",
      },
      {
        title: "Orders",
        value: totalOrders.toString(),
        unit: "",
        change: formatChange(totalOrders, recentOrders),
        changeType: recentOrders > 0 ? "positive" : "negative",
        icon: "DollarSign",
        color: "novus-green",
      },
    ];

    res.json({ success: true, data: kpiData });
  } catch (error) {
    console.error("Error fetching KPI data:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.get("/chart", async (req, res) => {
  try {
    const { range = "monthly" } = req.query; // options: daily, weekly, monthly
    const now = new Date();

    // Determine date range
    let startDate;
    if (range === "daily") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    } else if (range === "weekly") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1); // last 6 months
    }

    // Group orders by date
    const orderData = await prisma.order.groupBy({
      by: ["date"],
      where: {
        date: { gte: startDate },
        status: { not: "cancelled" },
      },
      _count: { id: true },
      _sum: { finalAmount: true },
      orderBy: { date: "asc" },
    });

    // Group payments by date
    const paymentData = await prisma.payment.groupBy({
      by: ["paymentDate"],
      where: {
        paymentDate: { gte: startDate },
        paymentStatus: "SUCCESS",
      },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { paymentDate: "asc" },
    });

    // Merge both datasets by date
    const merged = {};

    orderData.forEach((o) => {
      const key = new Date(o.date).toISOString().split("T")[0];
      if (!merged[key]) merged[key] = { time: key, orders: 0, revenue: 0, payments: 0 };
      merged[key].orders = o._count.id;
      merged[key].revenue = o._sum.finalAmount || 0;
    });

    paymentData.forEach((p) => {
      const key = new Date(p.paymentDate).toISOString().split("T")[0];
      if (!merged[key]) merged[key] = { time: key, orders: 0, revenue: 0, payments: 0 };
      merged[key].payments = p._sum.amount || 0;
    });

    // Sort by date
    const result = Object.values(merged).sort(
      (a, b) => new Date(a.time) - new Date(b.time)
    );

    res.json({
      success: true,
      range,
      totalOrders: orderData.reduce((acc, o) => acc + o._count.id, 0),
      totalRevenue: orderData.reduce((acc, o) => acc + (o._sum.finalAmount || 0), 0),
      totalPayments: paymentData.reduce((acc, p) => acc + (p._sum.amount || 0), 0),
      chartData: result,
    });
  } catch (error) {
    console.error("Error fetching order/payment analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics data",
    });
  }
});





export default router;
