import prisma from '../../lib/prisma.js';

// ─── helpers ──────────────────────────────────────────────────────────────────
const dayStart = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const dayEnd   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

const parseDateRange = (fromDate, toDate) => {
  const today = new Date();
  const from = fromDate ? dayStart(fromDate) : dayStart(new Date(today.getFullYear(), today.getMonth(), 1));
  const to   = toDate   ? dayEnd(toDate)     : dayEnd(today);
  return { from, to };
};

const sum = (arr, key) => arr.reduce((s, o) => s + (Number(o[key]) || 0), 0);

// ─────────────────────────────────────────────────────────────────────────────
// ✅ HELPER: Build per-test commission lookup map for a list of centerIds
//
// Returns:
//   Map<centerId, Map<testId, { type, value }>>
//
// If a testId has no specific commission entry → no commission (0)
// ─────────────────────────────────────────────────────────────────────────────
const buildCommissionMap = async (centerIds) => {
  if (!centerIds.length) return new Map();

  const commissions = await prisma.centerCategoryCommission.findMany({
    where:   { centerId: { in: centerIds } },
    include: {
      commissionTests: {
        select: { testId: true, type: true, value: true },
      },
    },
  });

  // Map<centerId, Map<testId, { type, value }>>
  const map = new Map();

  for (const comm of commissions) {
    if (!map.has(comm.centerId)) map.set(comm.centerId, new Map());
    const testMap = map.get(comm.centerId);

    for (const ct of comm.commissionTests) {
      testMap.set(ct.testId, { type: ct.type, value: Number(ct.value) });
    }
  }

  return map;
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ HELPER: Calculate commission amount for one test in one order
//   commissionMap — result of buildCommissionMap
//   centerId      — the partner center id
//   testId        — the checkup/test id (from orderCheckups)
//   billAmount    — order finalAmount (used for PERCENT calc)
// ─────────────────────────────────────────────────────────────────────────────
const calcTestCommission = (commissionMap, centerId, testId, billAmount) => {
  const testMap = commissionMap.get(centerId);
  if (!testMap) return 0;

  const entry = testMap.get(testId);
  if (!entry)  return 0;

  if (entry.type === "PERCENT") return (billAmount * entry.value) / 100;
  return entry.value; // AMOUNT
};

// ─────────────────────────────────────────────────────────────────────────────
// 1️⃣  COLLECTION REPORT
// ─────────────────────────────────────────────────────────────────────────────
export const getCollectionReport = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const { from, to } = parseDateRange(fromDate, toDate);

    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        paymentStatus: { in: ["paid", "CAPTURED", "COMPLETED"] },
      },
      select: {
        id: true,
        finalAmount: true,
        totalAmount: true,
        discount: true,
        paymentMode: true,
        source: true,
        isHomeSample: true,
        createdAt: true,
        diagnosticCenter: { select: { id: true, name: true } },
        payments: { select: { paymentMethod: true, amount: true } },
      },
    });

    const dateMap   = {};
    const modeMap   = {};
    const sourceMap = { app: { count: 0, amount: 0 }, walkin: { count: 0, amount: 0 } };
    const centerMap = {};

    for (const o of orders) {
      const amt     = o.finalAmount || 0;
      const dateKey = o.createdAt.toISOString().slice(0, 10);

      if (!dateMap[dateKey]) dateMap[dateKey] = { date: dateKey, count: 0, amount: 0, discount: 0 };
      dateMap[dateKey].count++;
      dateMap[dateKey].amount   += amt;
      dateMap[dateKey].discount += o.discount || 0;

      const mode = o.payments?.[0]?.paymentMethod || o.paymentMode || "UNKNOWN";
      if (!modeMap[mode]) modeMap[mode] = { mode, count: 0, amount: 0 };
      modeMap[mode].count++;
      modeMap[mode].amount += amt;

      const isApp = o.isHomeSample || (o.source || "").toLowerCase() === "app";
      const sk = isApp ? "app" : "walkin";
      sourceMap[sk].count++;
      sourceMap[sk].amount += amt;

      const cName = o.diagnosticCenter?.name || "No Center";
      const cId   = String(o.diagnosticCenter?.id || 0);
      if (!centerMap[cId]) centerMap[cId] = { name: cName, count: 0, amount: 0 };
      centerMap[cId].count++;
      centerMap[cId].amount += amt;
    }

    return res.json({
      success: true,
      summary: {
        totalOrders:    orders.length,
        totalCollection:sum(orders, "finalAmount"),
        totalDiscount:  sum(orders, "discount"),
        avgOrderValue:  orders.length ? Math.round(sum(orders, "finalAmount") / orders.length) : 0,
      },
      dateWise:   Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)),
      modeWise:   Object.values(modeMap).sort((a, b) => b.amount - a.amount),
      sourceWise: [
        { source: "App / Home", ...sourceMap.app },
        { source: "Walk-In / Center", ...sourceMap.walkin },
      ],
      centerWise: Object.values(centerMap).sort((a, b) => b.amount - a.amount),
    });
  } catch (err) {
    console.error("Collection report error:", err);
    res.status(500).json({ success: false, message: "Failed to generate collection report" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2️⃣  REVENUE REPORT
// ─────────────────────────────────────────────────────────────────────────────
export const getRevenueReport = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const { from, to } = parseDateRange(fromDate, toDate);

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        id: true,
        finalAmount: true,
        totalAmount: true,
        discount: true,
        discountAmount: true,
        couponCode: true,
        paymentStatus: true,
        centerId: true,
        createdAt: true,
        center: { select: { id: true, name: true, isSelf: true } },
      },
    });

    const novusOrders   = orders.filter((o) => !o.centerId || o.center?.isSelf);
    const partnerOrders = orders.filter((o) =>  o.centerId && !o.center?.isSelf);
    const couponDiscount = orders
      .filter((o) => o.couponCode)
      .reduce((s, o) => s + (o.discountAmount || o.discount || 0), 0);

    const monthMap = {};
    for (const o of orders) {
      const mk = o.createdAt.toISOString().slice(0, 7);
      if (!monthMap[mk]) monthMap[mk] = { month: mk, novus: 0, partner: 0, discount: 0, total: 0 };
      const isPartner = o.centerId && !o.center?.isSelf;
      monthMap[mk].total    += o.finalAmount || 0;
      monthMap[mk].discount += o.discount    || 0;
      if (isPartner) monthMap[mk].partner += o.finalAmount || 0;
      else           monthMap[mk].novus   += o.finalAmount || 0;
    }

    return res.json({
      success: true,
      summary: {
        totalOrders:       orders.length,
        grossRevenue:      sum(orders, "totalAmount"),
        totalDiscount:     sum(orders, "discount"),
        netRevenue:        sum(orders, "finalAmount"),
        novusRevenue:      sum(novusOrders, "finalAmount"),
        partnerRevenue:    sum(partnerOrders, "finalAmount"),
        couponDiscount,
        otherDiscount:     sum(orders, "discount") - couponDiscount,
        pendingCollection: orders
          .filter((o) => ["pending","PENDING"].includes(o.paymentStatus))
          .reduce((s, o) => s + (o.finalAmount || 0), 0),
        novusOrderCount:   novusOrders.length,
        partnerOrderCount: partnerOrders.length,
      },
      monthlyTrend: Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)),
    });
  } catch (err) {
    console.error("Revenue report error:", err);
    res.status(500).json({ success: false, message: "Failed to generate revenue report" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3️⃣  PARTNER SETTLEMENT REPORT  ✅ Updated for per-test commission
// ─────────────────────────────────────────────────────────────────────────────
export const getPartnerSettlementReport = async (req, res) => {
  try {
    const { fromDate, toDate, centerId, settlementStatus } = req.query;
    const { from, to } = parseDateRange(fromDate, toDate);

    const where = { createdAt: { gte: from, lte: to }, centerId: { not: null } };
    if (centerId && centerId !== "all") where.centerId = Number(centerId);

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        finalAmount: true,
        totalAmount: true,
        discount: true,
        paymentStatus: true,
        status: true,
        createdAt: true,
        patient: { select: { fullName: true, contactNo: true } },
        center: { select: { id: true, name: true, isSelf: true } },
        orderCheckups: {
          select: {
            checkup: { select: { id: true, name: true, testType: true, categoryId: true } },
          },
        },
      },
    });

    const partnerOrders = orders.filter((o) => o.center && !o.center.isSelf);

    // ✅ Build per-test commission map for all involved partner centers
    const centerIds    = [...new Set(partnerOrders.map((o) => o.center.id))];
    const commissionMap = await buildCommissionMap(centerIds);

    const rows = partnerOrders.map((o) => {
      const checkup    = o.orderCheckups?.[0]?.checkup;
      const testId     = checkup?.id     || null;
      const testName   = checkup?.name   || "Lab Test";
      const testType   = checkup?.testType || "PATHOLOGY";
      const billAmount = o.finalAmount || 0;

      // ✅ Per-test commission lookup
      const novusCommission = testId
        ? calcTestCommission(commissionMap, o.center.id, testId, billAmount)
        : 0;

      const partnerShare = Math.max(0, billAmount - novusCommission);
      const isPaid = ["paid","CAPTURED","COMPLETED"].includes(o.paymentStatus);

      return {
        orderId:          o.id,
        partnerName:      o.center?.name || "—",
        testName,
        testType,
        testId,
        patientName:      o.patient?.fullName  || "—",
        patientPhone:     o.patient?.contactNo || "—",
        billAmount,
        partnerShare:     Math.max(0, partnerShare),
        novusCommission:  Math.max(0, novusCommission),
        orderStatus:      o.status,
        paymentStatus:    o.paymentStatus,
        settlementStatus: isPaid ? "Paid" : "Pending",
        date:             o.createdAt,
      };
    });

    const filteredRows = settlementStatus && settlementStatus !== "all"
      ? rows.filter((r) => r.settlementStatus.toLowerCase() === settlementStatus.toLowerCase())
      : rows;

    // Group by center
    const byCenter = {};
    for (const r of filteredRows) {
      const k = r.partnerName;
      if (!byCenter[k]) byCenter[k] = { name: k, orders: 0, bill: 0, partner: 0, commission: 0 };
      byCenter[k].orders++;
      byCenter[k].bill       += r.billAmount;
      byCenter[k].partner    += r.partnerShare;
      byCenter[k].commission += r.novusCommission;
    }

    return res.json({
      success: true,
      summary: {
        totalOrders:          filteredRows.length,
        totalBillAmount:      filteredRows.reduce((s, r) => s + r.billAmount, 0),
        totalPartnerShare:    filteredRows.reduce((s, r) => s + r.partnerShare, 0),
        totalNovusCommission: filteredRows.reduce((s, r) => s + r.novusCommission, 0),
        pendingCount:         filteredRows.filter((r) => r.settlementStatus === "Pending").length,
        paidCount:            filteredRows.filter((r) => r.settlementStatus === "Paid").length,
      },
      rows:     filteredRows,
      byCenter: Object.values(byCenter).sort((a, b) => b.bill - a.bill),
    });
  } catch (err) {
    console.error("Partner settlement error:", err);
    res.status(500).json({ success: false, message: "Failed to generate partner settlement report" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4️⃣  PAYMENT GATEWAY REPORT
// ─────────────────────────────────────────────────────────────────────────────
export const getPaymentGatewayReport = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const { from, to } = parseDateRange(fromDate, toDate);

    const payments = await prisma.payment.findMany({
      where:    { createdAt: { gte: from, lte: to } },
      orderBy:  { createdAt: "desc" },
      select: {
        id: true, paymentId: true, paymentMethod: true, paymentMode: true,
        paymentStatus: true, amount: true, capturedAmount: true, refundAmount: true,
        referenceId: true, transactionNote: true, createdAt: true,
        order:   { select: { id: true, orderNumber: true } },
        patient: { select: { fullName: true, contactNo: true } },
        paymentGateway: { select: { name: true } },
      },
    });

    const gatewayMap = {};
    const methodMap  = {};

    for (const p of payments) {
      const gw     = p.paymentGateway?.name || p.paymentMethod || "UNKNOWN";
      const method = p.paymentMethod || "UNKNOWN";
      const isCaptured = ["CAPTURED","COMPLETED"].includes(p.paymentStatus);

      if (!gatewayMap[gw]) gatewayMap[gw] = { gateway: gw, count: 0, amount: 0, captured: 0, refunded: 0, failed: 0, pending: 0 };
      gatewayMap[gw].count++;
      gatewayMap[gw].amount += p.amount || 0;
      if (isCaptured)                       gatewayMap[gw].captured += p.capturedAmount || p.amount || 0;
      if (p.paymentStatus === "REFUNDED")   gatewayMap[gw].refunded += p.refundAmount   || 0;
      if (p.paymentStatus === "FAILED")     gatewayMap[gw].failed++;
      if (["PENDING","AUTHORIZED"].includes(p.paymentStatus)) gatewayMap[gw].pending++;

      if (!methodMap[method]) methodMap[method] = { method, count: 0, amount: 0 };
      methodMap[method].count++;
      if (isCaptured) methodMap[method].amount += p.amount || 0;
    }

    const captured = payments.filter((p) => ["CAPTURED","COMPLETED"].includes(p.paymentStatus));
    const refunded = payments.filter((p) => p.paymentStatus === "REFUNDED");
    const failed   = payments.filter((p) => p.paymentStatus === "FAILED");
    const pending  = payments.filter((p) => ["PENDING","AUTHORIZED"].includes(p.paymentStatus));

    return res.json({
      success: true,
      summary: {
        totalTransactions: payments.length,
        totalAmount:    payments.reduce((s, p) => s + (p.amount || 0), 0),
        capturedAmount: captured.reduce((s, p) => s + (p.capturedAmount || p.amount || 0), 0),
        refundedAmount: refunded.reduce((s, p) => s + (p.refundAmount || 0), 0),
        failedCount:    failed.length,
        pendingCount:   pending.length,
      },
      gatewayWise:         Object.values(gatewayMap),
      methodWise:          Object.values(methodMap),
      failedTransactions:  failed,
      pendingTransactions: pending,
      allTransactions:     payments,
    });
  } catch (err) {
    console.error("Gateway report error:", err);
    res.status(500).json({ success: false, message: "Failed to generate gateway report" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5️⃣  WALK-IN BILLING REPORT
// ─────────────────────────────────────────────────────────────────────────────
export const getWalkInReport = async (req, res) => {
  try {
    const { fromDate, toDate, createdById } = req.query;
    const { from, to } = parseDateRange(fromDate, toDate);

    const where = {
      createdAt: { gte: from, lte: to },
      isHomeSample: false,
      createdById: { not: null },
    };
    if (createdById && createdById !== "all") where.createdById = Number(createdById);

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, finalAmount: true, totalAmount: true, discount: true,
        paymentMode: true, paymentStatus: true, status: true, source: true, createdAt: true,
        patient:         { select: { fullName: true, contactNo: true } },
        createdBy:       { select: { id: true, name: true, role: true } },
        diagnosticCenter:{ select: { name: true } },
        payments:        { select: { paymentMethod: true, amount: true } },
      },
    });

    const cashOrders    = [];
    const digitalOrders = [];
    const dailyMap      = {};
    const userMap       = {};

    for (const o of orders) {
      const method = o.payments?.[0]?.paymentMethod || o.paymentMode || "";
      const isCash = ["CASH","cash"].includes(method);
      if (isCash) cashOrders.push(o); else digitalOrders.push(o);

      const dk = o.createdAt.toISOString().slice(0, 10);
      if (!dailyMap[dk]) dailyMap[dk] = { date: dk, count: 0, cash: 0, digital: 0, total: 0, discount: 0 };
      dailyMap[dk].count++;
      dailyMap[dk].total    += o.finalAmount || 0;
      dailyMap[dk].discount += o.discount    || 0;
      if (isCash) dailyMap[dk].cash    += o.finalAmount || 0;
      else        dailyMap[dk].digital += o.finalAmount || 0;

      const uid   = o.createdBy?.id   || 0;
      const uname = o.createdBy?.name || "Unknown";
      if (!userMap[uid]) userMap[uid] = { id: uid, name: uname, count: 0, amount: 0 };
      userMap[uid].count++;
      userMap[uid].amount += o.finalAmount || 0;
    }

    return res.json({
      success: true,
      summary: {
        totalOrders:   orders.length,
        totalAmount:   sum(orders, "finalAmount"),
        totalDiscount: sum(orders, "discount"),
        cashAmount:    cashOrders.reduce((s, o)    => s + (o.finalAmount || 0), 0),
        digitalAmount: digitalOrders.reduce((s, o) => s + (o.finalAmount || 0), 0),
        cashCount:     cashOrders.length,
        digitalCount:  digitalOrders.length,
      },
      dailyClosing: Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date)),
      byUser:       Object.values(userMap).sort((a, b) => b.amount - a.amount),
      rows:         orders,
    });
  } catch (err) {
    console.error("Walk-in report error:", err);
    res.status(500).json({ success: false, message: "Failed to generate walk-in report" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 📤  CSV EXPORT  ✅ Updated partner-settlement section for per-test commission
// ─────────────────────────────────────────────────────────────────────────────
export const exportReport = async (req, res) => {
  try {
    const { type, fromDate, toDate } = req.query;
    const { from, to } = parseDateRange(fromDate, toDate);
    let data     = [];
    let filename = `${type}-report-${new Date().toISOString().slice(0,10)}`;

    // ── Collection ────────────────────────────────────────────────────────────
    if (type === "collection") {
      const orders = await prisma.order.findMany({
        where: { createdAt: { gte: from, lte: to }, paymentStatus: { in: ["paid","CAPTURED","COMPLETED"] } },
        select: {
          id: true, finalAmount: true, totalAmount: true, discount: true,
          paymentMode: true, source: true, isHomeSample: true, createdAt: true,
          patient:         { select: { fullName: true, contactNo: true } },
          diagnosticCenter:{ select: { name: true } },
          payments:        { select: { paymentMethod: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      data = orders.map((o) => ({
        "Order ID":       `ORD-${o.id}`,
        Date:             o.createdAt.toLocaleDateString("en-IN"),
        Time:             o.createdAt.toLocaleTimeString("en-IN"),
        "Patient Name":   o.patient?.fullName  || "",
        "Patient Phone":  o.patient?.contactNo || "",
        "Center":         o.diagnosticCenter?.name || "",
        "Payment Method": o.payments?.[0]?.paymentMethod || o.paymentMode || "",
        "Source":         o.isHomeSample ? "Home Collection" : (o.source || "Walk-In"),
        "MRP (₹)":       o.totalAmount  || 0,
        "Discount (₹)":  o.discount     || 0,
        "Amount (₹)":    o.finalAmount  || 0,
      }));
    }

    // ── Revenue ───────────────────────────────────────────────────────────────
    if (type === "revenue") {
      const orders = await prisma.order.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          id: true, finalAmount: true, totalAmount: true, discount: true,
          discountAmount: true, couponCode: true, paymentStatus: true,
          source: true, centerId: true, createdAt: true,
          center: { select: { name: true, isSelf: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      data = orders.map((o) => ({
        "Order ID":                `ORD-${o.id}`,
        Date:                      o.createdAt.toLocaleDateString("en-IN"),
        "Revenue Type":            (o.centerId && !o.center?.isSelf) ? "Partner" : "Novus Own",
        "Partner Center":          o.center?.name || "",
        "Gross Amount (₹)":        o.totalAmount  || 0,
        "Discount (₹)":            o.discount     || 0,
        "Coupon Code":             o.couponCode   || "",
        "Coupon Discount (₹)":     o.couponCode ? (o.discountAmount || 0) : 0,
        "Net Amount (₹)":          o.finalAmount  || 0,
        "Payment Status":          o.paymentStatus || "",
      }));
    }

    // ── Partner Settlement  ✅ Per-test commission ─────────────────────────────
    if (type === "partner-settlement") {
      const orders = await prisma.order.findMany({
        where:   { createdAt: { gte: from, lte: to }, centerId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, finalAmount: true, paymentStatus: true, status: true, createdAt: true,
          patient:  { select: { fullName: true, contactNo: true } },
          center:   { select: { id: true, name: true, isSelf: true } },
          orderCheckups: {
            select: {
              checkup: { select: { id: true, name: true, testType: true } },
            },
          },
        },
      });

      const partnerOrders = orders.filter((o) => o.center && !o.center.isSelf);
      const centerIds     = [...new Set(partnerOrders.map((o) => o.center.id))];
      const commissionMap = await buildCommissionMap(centerIds);

      data = partnerOrders.map((o) => {
        const checkup    = o.orderCheckups?.[0]?.checkup;
        const testId     = checkup?.id || null;
        const bill       = o.finalAmount || 0;
        const novus      = testId
          ? Math.max(0, calcTestCommission(commissionMap, o.center.id, testId, bill))
          : 0;

        return {
          "Order ID":             `ORD-${o.id}`,
          Date:                   o.createdAt.toLocaleDateString("en-IN"),
          "Partner Center":       o.center?.name  || "",
          "Test Name":            checkup?.name   || "",
          "Test Type":            checkup?.testType || "",
          "Patient Name":         o.patient?.fullName  || "",
          "Patient Phone":        o.patient?.contactNo || "",
          "Bill Amount (₹)":      bill,
          "Novus Commission (₹)": novus,
          "Partner Share (₹)":    Math.max(0, bill - novus),
          "Settlement Status":    ["paid","CAPTURED","COMPLETED"].includes(o.paymentStatus) ? "Paid" : "Pending",
          "Order Status":         o.status || "",
        };
      });
    }

    // ── Gateway ───────────────────────────────────────────────────────────────
    if (type === "gateway") {
      const payments = await prisma.payment.findMany({
        where:   { createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: "desc" },
        select: {
          paymentId: true, paymentMethod: true, paymentStatus: true,
          amount: true, capturedAmount: true, refundAmount: true,
          referenceId: true, transactionNote: true, createdAt: true,
          order:   { select: { id: true } },
          patient: { select: { fullName: true, contactNo: true } },
          paymentGateway: { select: { name: true } },
        },
      });
      data = payments.map((p) => ({
        "Transaction ID": p.paymentId,
        Date:             p.createdAt.toLocaleDateString("en-IN"),
        Time:             p.createdAt.toLocaleTimeString("en-IN"),
        "Gateway":        p.paymentGateway?.name || p.paymentMethod || "",
        "Method":         p.paymentMethod  || "",
        "Order ID":       p.order?.id ? `ORD-${p.order.id}` : "",
        "Patient":        p.patient?.fullName || "",
        "Amount (₹)":     p.amount         || 0,
        "Captured (₹)":   p.capturedAmount || 0,
        "Refund (₹)":     p.refundAmount   || 0,
        "Status":         p.paymentStatus  || "",
        "Reference ID":   p.referenceId    || "",
        "Notes":          p.transactionNote || "",
      }));
    }

    // ── Walk-In ───────────────────────────────────────────────────────────────
    if (type === "walkin") {
      const orders = await prisma.order.findMany({
        where:   { createdAt: { gte: from, lte: to }, isHomeSample: false, createdById: { not: null } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, finalAmount: true, discount: true, paymentMode: true,
          paymentStatus: true, status: true, createdAt: true,
          patient:         { select: { fullName: true, contactNo: true } },
          createdBy:       { select: { name: true } },
          diagnosticCenter:{ select: { name: true } },
          payments:        { select: { paymentMethod: true } },
        },
      });
      data = orders.map((o) => ({
        "Order ID":       `ORD-${o.id}`,
        Date:             o.createdAt.toLocaleDateString("en-IN"),
        Time:             o.createdAt.toLocaleTimeString("en-IN"),
        "Admin User":     o.createdBy?.name    || "",
        "Patient Name":   o.patient?.fullName  || "",
        "Patient Phone":  o.patient?.contactNo || "",
        "Center":         o.diagnosticCenter?.name || "",
        "Payment Mode":   o.payments?.[0]?.paymentMethod || o.paymentMode || "",
        "Amount (₹)":     o.finalAmount || 0,
        "Discount (₹)":   o.discount    || 0,
        "Payment Status": o.paymentStatus || "",
        "Order Status":   o.status        || "",
      }));
    }

    if (!data.length) {
      return res.json({ success: true, message: "No data for the selected range" });
    }

    // Build CSV with BOM for Excel
    const headers  = Object.keys(data[0]);
    const csvLines = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((h) => {
          const val = String(row[h] ?? "").replace(/"/g, '""');
          return val.includes(",") || val.includes('"') || val.includes("\n")
            ? `"${val}"`
            : val;
        }).join(",")
      ),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    return res.send("\uFEFF" + csvLines.join("\n"));
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ success: false, message: "Export failed" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Filter dropdown data
// ─────────────────────────────────────────────────────────────────────────────
export const getReportFilterData = async (req, res) => {
  try {
    const [centers, adminUsers] = await Promise.all([
      prisma.center.findMany({
        where:  { isSelf: false },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where:  { isActive: true },
        select: { id: true, name: true, role: true },
      }),
    ]);
    res.json({ success: true, centers, adminUsers });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch filter data" });
  }
};