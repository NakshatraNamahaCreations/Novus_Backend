import prisma from "./prisma.js";

/**
 * Generate invoice number in format: NHL-01/26-27
 * Financial year runs April to March.
 */
export async function generateInvoiceNumber() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (0=Jan, 3=Apr)
  const year = now.getFullYear();

  // Financial year: Apr 2026 - Mar 2027 → "26-27"
  const fyStart = month >= 3 ? year : year - 1;
  const fyEnd = fyStart + 1;
  const fySuffix = `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;

  // Find the last invoice number for this financial year
  const lastPayment = await prisma.payment.findFirst({
    where: {
      invoiceNumber: { endsWith: `/${fySuffix}` },
    },
    orderBy: { id: "desc" },
    select: { invoiceNumber: true },
  });

  let nextNum = 1;
  if (lastPayment?.invoiceNumber) {
    const match = lastPayment.invoiceNumber.match(/^NHL-(\d+)\//);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }

  return `NHL-${String(nextNum).padStart(2, "0")}/${fySuffix}`;
}
