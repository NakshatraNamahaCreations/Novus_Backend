import prisma from "./prisma.js";

/**
 * Generate invoice number in format: NHL-01/26-27
 * Financial year runs April to March.
 *
 * Uses a retry loop to handle concurrent requests that may generate the same
 * number simultaneously. The caller (payment.create) has a unique constraint
 * on invoiceNumber, so on collision we re-read and try the next slot.
 */
export async function generateInvoiceNumber(maxRetries = 5) {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (0=Jan, 3=Apr)
  const year = now.getFullYear();

  // Financial year: Apr 2026 - Mar 2027 → "26-27"
  const fyStart = month >= 3 ? year : year - 1;
  const fyEnd = fyStart + 1;
  const fySuffix = `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;

  // Fetch all invoice numbers for this FY and find the true max numerically
  const allPayments = await prisma.payment.findMany({
    where: { invoiceNumber: { endsWith: `/${fySuffix}` } },
    select: { invoiceNumber: true },
  });

  let maxNum = 0;
  for (const p of allPayments) {
    const match = p.invoiceNumber?.match(/^NHL-(\d+)\//);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const candidate = `NHL-${String(maxNum + 1 + attempt).padStart(2, "0")}/${fySuffix}`;

    const conflict = await prisma.payment.findUnique({
      where: { invoiceNumber: candidate },
      select: { id: true },
    });

    if (!conflict) return candidate;
  }

  throw new Error(`Failed to generate a unique invoice number after ${maxRetries} attempts`);
}
