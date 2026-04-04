// order.edit.controller.js
// Handles GET /orders/:id/edit-data  and  PUT /orders/:id/edit-tests

import prisma from '../../lib/prisma.js';
import { invoiceQueue } from '../../queues/invoice.queue.js';


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/:id/edit-data
// Returns current tests/packages in the order, prices, discount, etc.
// ─────────────────────────────────────────────────────────────────────────────
export const getOrderEditData = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id:             true,
        orderNumber:    true,
        paymentStatus:  true,
        totalAmount:    true,
        discountAmount: true,
        finalAmount:    true,
        collectionCharge: true,   // add this field if not present yet — see schema note
        remarks:        true,
        orderMembers: {
          select: {
            id: true,
            patient: { select: { id: true, fullName: true } },
            orderMemberPackages: {
              select: {
                id:        true,
                price:     true,   // custom price override (see schema note)
                testId:    true,
                packageId: true,
                test: {
                  select: {
                    id:          true,
                    name:        true,
                    offerPrice:  true,
                    actualPrice: true,
                    testType:    true,   // ✅ correct field name on Test model
                    category:    { select: { name: true } },
                  },
                },
                package: {
                  select: {
                    id:          true,
                    name:        true,
                    offerPrice:  true,
                    actualPrice: true,
                    testType:    true,   // ✅ HealthPackage also uses testType
                    category:    { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    // ── Flatten all member packages into a single items list ───────────────
    const items = [];
    for (const member of order.orderMembers) {
      for (const omp of member.orderMemberPackages) {
        const entity    = omp.test || omp.package;
        const basePrice = entity?.offerPrice ?? entity?.actualPrice ?? 0;
        items.push({
          id:        omp.id,
          memberId:  member.id,
          testId:    omp.testId,
          packageId: omp.packageId,
          name:      entity?.name ?? "Unknown",
          type:      entity?.testType ?? "PATHOLOGY",   // ✅ testType not type
          category:  entity?.category?.name ?? "",
          basePrice,
          price:     omp.price != null ? omp.price : basePrice,
        });
      }
    }

    return res.json({
      orderId:          order.id,
      orderNumber:      order.orderNumber,
      items,
      totalAmount:      order.totalAmount,
      discountAmount:   order.discountAmount,
      collectionCharge: order.collectionCharge ?? 0,
      finalAmount:      order.finalAmount,
      remarks:          order.remarks,
    });
  } catch (err) {
    console.error("[getOrderEditData]", err);
    return res.status(500).json({ message: "Failed to load order edit data" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/orders/:id/edit-tests
// Body:
//   items[]          – { id?, memberId?, testId?, packageId?, price }
//   discountAmount   – number
//   collectionCharge – number
//   finalAmount      – number  (pre-calculated on frontend, verified here)
//   totalAmount      – number
//   remarks          – string
// ─────────────────────────────────────────────────────────────────────────────
export const updateOrderTests = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const {
      items = [],
      discountAmount   = 0,
      collectionCharge = 0,
      finalAmount,
      totalAmount,
      remarks,
      regenerateInvoice = false,
    } = req.body;

    if (!items.length) {
      return res.status(400).json({ message: "Order must have at least one test" });
    }

    // ── Guard: only pending orders ─────────────────────────────────────────
    const existing = await prisma.order.findUnique({
      where:  { id: orderId },
      select: {
        id:           true,
        paymentStatus:true,
        orderMembers: {
          select: {
            id: true,
            patientId: true,
            orderMemberPackages: { select: { id: true } },
          },
        },
      },
    });

    if (!existing) return res.status(404).json({ message: "Order not found" });

    // ── Get or create the primary OrderMember ─────────────────────────────
    // Most orders have one member (self). If needed, new items are attached to
    // the first member. If no members exist somehow, we bail.
    const primaryMember = existing.orderMembers[0];
    if (!primaryMember) {
      return res.status(400).json({ message: "No order member found for this order" });
    }

    // ── Collect existing OMP ids so we know what to delete ─────────────────
    const existingOmpIds = existing.orderMembers.flatMap((m) =>
      m.orderMemberPackages.map((p) => p.id)
    );

    // ── Partition incoming items into keep-existing vs create-new ──────────
    const keepIds    = items.filter((i) => i.id != null).map((i) => i.id);
    const deleteIds  = existingOmpIds.filter((id) => !keepIds.includes(id));
    const newItems   = items.filter((i) => i.id == null);

    // ── Validate server-side total ─────────────────────────────────────────
    const computedSubtotal = items.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
    const computedFinal    = Math.max(0, computedSubtotal - discountAmount + collectionCharge);
    // Allow ±1 rounding tolerance
    if (Math.abs(computedFinal - finalAmount) > 1) {
      return res.status(400).json({
        message: `Final amount mismatch. Expected ${computedFinal}, received ${finalAmount}`,
      });
    }

    // ── Run in a transaction ───────────────────────────────────────────────
    const updatedOrder = await prisma.$transaction(async (tx) => {

      // 1. Delete removed OMPs
      if (deleteIds.length > 0) {
        await tx.orderMemberPackage.deleteMany({
          where: { id: { in: deleteIds } },
        });
      }

      // 2. Update price on kept OMPs (custom override)
      for (const item of items.filter((i) => i.id != null)) {
        await tx.orderMemberPackage.update({
          where: { id: item.id },
          data:  { price: parseFloat(item.price) || null },
        });
      }

      // 3. Create new OMPs
      if (newItems.length > 0) {
        await tx.orderMemberPackage.createMany({
          data: newItems.map((item) => ({
            orderMemberId: item.memberId ?? primaryMember.id,
            testId:        item.testId    ?? null,
            packageId:     item.packageId ?? null,
            price:         parseFloat(item.price) || null,
          })),
        });
      }

      // 4. Update Order totals
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          totalAmount:      computedSubtotal,
          discountAmount:   discountAmount,
          collectionCharge: collectionCharge,
          finalAmount:      computedFinal,
          ...(remarks !== undefined ? { remarks } : {}),
          updatedAt:        new Date(),
        },
      });

      return order;
    });

    // ── Regenerate invoices for all linked payments ─────────────────────────
    if (regenerateInvoice) {
      const payments = await prisma.payment.findMany({
        where: { orderId },
        select: { id: true, paymentId: true },
      });

      for (const p of payments) {
        // Clear existing invoiceUrl so the worker regenerates it
        await prisma.payment.update({
          where: { id: p.id },
          data: { invoiceUrl: null },
        });

        await invoiceQueue.add("generate-invoice", { paymentId: p.paymentId });
      }
    }

    return res.json({
      success: true,
      message: "Order updated successfully",
      order:   updatedOrder,
      invoiceRegenerated: regenerateInvoice,
    });
  } catch (err) {
    console.error("[updateOrderTests]", err);
    return res.status(500).json({ message: "Failed to update order" });
  }
};