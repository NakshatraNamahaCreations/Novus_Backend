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

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Re-read on every attempt so a concurrent insert is visible
    const lastPayment = await prisma.payment.findFirst({
      where: { invoiceNumber: { endsWith: `/${fySuffix}` } },
      orderBy: { id: "desc" },
      select: { invoiceNumber: true },
    });

    let nextNum = 1;
    if (lastPayment?.invoiceNumber) {
      const match = lastPayment.invoiceNumber.match(/^NHL-(\d+)\//);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }

    const candidate = `NHL-${String(nextNum).padStart(2, "0")}/${fySuffix}`;

    // Check if this candidate already exists (race window check)
    const conflict = await prisma.payment.findUnique({
      where: { invoiceNumber: candidate },
      select: { id: true },
    });

    if (!conflict) return candidate;
    // Another request grabbed this number — loop and try the next one
  }

  throw new Error(`Failed to generate a unique invoice number after ${maxRetries} attempts`);
}
