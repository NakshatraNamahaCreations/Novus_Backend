// utils/generateInvoice.js
import puppeteer from "puppeteer";
import { uploadBufferToS3 } from "../config/s3.js";

import prisma from '../lib/prisma.js';

// ---------------- helpers ----------------
const numberToIndianWords = (num) => {
  const n = Number(num || 0);
  if (n === 0) return "Zero Rupees Only";

  const belowTwenty = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];

  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty",
    "Sixty", "Seventy", "Eighty", "Ninety",
  ];

  // Convert numbers up to 999 into words
  const helper = (v) => {
    v = Number(v || 0);
    if (v === 0) return "";
    if (v < 20) return belowTwenty[v] + " ";
    if (v < 100) return tens[Math.floor(v / 10)] + (v % 10 ? " " + belowTwenty[v % 10] : "") + " ";
    return belowTwenty[Math.floor(v / 100)] + " Hundred " + helper(v % 100);
  };

  // Indian number system: Crore(10^7), Lakh(10^5), Thousand(10^3)
  let v = Math.floor(n);
  let result = "";

  if (v >= 1_00_00_000) {
    result += helper(Math.floor(v / 1_00_00_000)) + "Crore ";
    v %= 1_00_00_000;
  }
  if (v >= 1_00_000) {
    result += helper(Math.floor(v / 1_00_000)) + "Lakh ";
    v %= 1_00_000;
  }
  if (v >= 1_000) {
    result += helper(Math.floor(v / 1_000)) + "Thousand ";
    v %= 1_000;
  }
  if (v > 0) {
    result += helper(v);
  }

  const words = result.trim();
  return words ? `${words} Rupees Only` : "Zero Rupees Only";
};

const getCollectionCharge = async (order, offerSubtotal) => {
  try {
    // ✅ Only apply collection charge to home-sample orders.
    // Walk-in / B2B orders must never show a home-collection charge.
    if (!order?.isHomeSample) return 0;

    // ✅ Prefer the value persisted on the order itself (set at order creation).
    // This guarantees the invoice matches what the user actually confirmed.
    if (order?.collectionCharge != null) {
      return Number(order.collectionCharge) || 0;
    }

    // Fallback: derive from the active rule if nothing was stored on the order
    const rule = await prisma.collectionPrice.findFirst({
      where: { isActive: true },
    });

    if (!rule) return 0;

    const minAmount = Number(rule.minAmount || 0);
    const price = Number(rule.price || 0);

    // ✅ If the order subtotal is below the minimum fixed amount,
    // the collection charge must NOT be shown in the invoice.
    return Number(offerSubtotal) < minAmount ? 0 : price;
  } catch (e) {
    console.error("getCollectionCharge error:", e);
    return 0;
  }
};

// ---------------- main ----------------

export const generateAndUploadInvoice = async ({
  paymentId,
  patientName,
  orderId,
  invoiceNumber
}) => {
  const logo =
    "https://novus-images.s3.ap-southeast-2.amazonaws.com/novus-logo.webp";
  const paidimg =
    "https://novus-images.s3.ap-southeast-2.amazonaws.com/paid.png";

  const fetchOrder = async () => {
    try {
      return await prisma.order.findUnique({
        where: { id: Number(orderId) },
        include: {
          patient: true,
          address: true,
          slot: true,
          refCenter: true,
          doctor: true,
          orderMembers: {
            include: {
              patient: true,
              orderMemberPackages: {
                include: {
                  test: {
                    select: { name: true, offerPrice: true, actualPrice: true },
                  },
                  package: {
                    select: { name: true, offerPrice: true, actualPrice: true },
                  },
                },
              },
            },
          },
        },
      });
    } catch (err) {
      console.error("fetchOrder error:", err);
      throw err;
    }
  };

  try {
    const order = await fetchOrder();
    if (!order) throw new Error(`Order not found for orderId=${orderId}`);

    // ---------------- patient-wise rows + totals ----------------
    let sr = 1;

    // Use custom price if set, otherwise fall back to offer price
    const offerSubtotal = (order.orderMembers || []).reduce((t, member) => {
      return (
        t +
        (member.orderMemberPackages || []).reduce((pt, omp) => {
          const price = omp.price != null
            ? Number(omp.price)
            : Number(omp?.test?.offerPrice ?? omp?.package?.offerPrice ?? 0);
          return pt + price;
        }, 0)
      );
    }, 0);

    const discount = Number(order?.discountAmount || order?.discount || 0);
    const collectionCharge = await getCollectionCharge(order, offerSubtotal);

    console.log("collectionCharge", collectionCharge);

    const payableTotal =
      Math.max(0, offerSubtotal - discount) + Number(collectionCharge || 0);

    const amountInWords = numberToIndianWords(payableTotal);

    // Patient-wise rows — only SR, NAME, PRICE (offer)
    const patientWiseRows = (order.orderMembers || [])
      .map((member) => {
        const p = member?.patient;

        const header = `
          <tr>
            <td colspan="3" style="background:#f3fbfd; font-weight:700; padding:10px;">
              Patient: ${p?.fullName || "NA"} ${p?.age ? `(${p.age}Y)` : ""} ${
                p?.gender ? `| ${p.gender}` : ""
              }
              ${p?.relationship ? `| ${p.relationship}` : ""}
            </td>
          </tr>
        `;

        const rows = (member.orderMemberPackages || [])
          .map((omp) => {
            const name = omp?.test?.name || omp?.package?.name || "N/A";
            const price = omp.price != null
              ? Number(omp.price)
              : Number(omp?.test?.offerPrice ?? omp?.package?.offerPrice ?? 0);

            return `
              <tr>
                <td>${sr++}</td>
                <td>${name}</td>
                <td>&#8377; ${price.toLocaleString("en-IN")}</td>
              </tr>
            `;
          })
          .join("");

        return (
          header +
          (rows ||
            `
            <tr>
              <td>${sr++}</td>
              <td>N/A</td>
              <td>&#8377; 0</td>
            </tr>
          `)
        );
      })
      .join("");

    // ---------------- invoice metadata ----------------
    const patientAddress =
      order?.address?.address || order?.patient?.address || "NA";

    const invoiceDate = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // ---------------- Invoice HTML ----------------
    const invoiceHtml = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              font-family: Arial, Helvetica, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f9f9f9;
              font-size: 13px;
              -webkit-print-color-adjust: exact;
              color: #333;
            }
            .invoice {
              width: 100%;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
              background-color: white;
              box-sizing: border-box;
            }
            .invoice-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 3px solid #00a0b5;
              padding-bottom: 15px;
              margin-bottom: 25px;
            }
            .company-logo img {
              height: 60px;
              max-width: 240px;
              object-fit: contain;
            }
            .invoice-info {
              text-align: right;
              font-size: 12px;
              color: #444;
            }
            .invoice-info p {
              margin: 4px 0;
            }
            .details {
              display: flex;
              justify-content: space-between;
              margin-bottom: 30px;
              gap: 20px;
            }
            .details .section {
              width: 48%;
            }
            .details h3 {
              margin: 0 0 10px 0;
              font-size: 15px;
              color: #222;
              border-bottom: 1px solid #eee;
              padding-bottom: 6px;
            }
            .details p {
              margin: 6px 0;
              line-height: 1.5;
            }
            .test-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
              border: 1px solid #ddd;
            }
            .test-table th, .test-table td {
              padding: 12px 14px;
              border: 1px solid #ddd;
              text-align: left;
              font-size: 13px;
            }
            .test-table th {
              background-color: #00a0b5;
              color: white;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .test-table tr:nth-child(even) {
              background-color: #fdfaf5;
            }
            .footer {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-top: 3px solid #00a0b5;
              padding-top: 25px;
              margin-top: 30px;
            }
            .paid-stamp-container {
              min-height: 140px;
              display: flex;
              align-items: flex-start;
            }
            .paid-stamp-img {
              width: 130px;
              opacity: 0.9;
              transform: rotate(-12deg);
            }
            .total-section {
              text-align: right;
              min-width: 270px;
            }
            .amount-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8px;
              padding-bottom: 6px;
              border-bottom: 1px dotted #ccc;
              font-size: 13px;
            }
            .amount-label {
              text-align: left;
              min-width: 150px;
              color: #555;
            }
            .amount-value {
              font-weight: 600;
              min-width: 110px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              margin-top: 12px;
              padding-top: 12px;
              border-top: 2px solid #333;
              font-size: 15px;
              font-weight: bold;
            }
            .total-label {
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .total-value {
              font-size: 17px;
            }
            .amount-in-words {
              margin-top: 16px;
              font-size: 13.5px;
              font-weight: 600;
              color: #2c3e50;
              text-align: right;
              line-height: 1.4;
            }
            .note {
              font-size: 12px;
              color: #e74c3c;
              font-style: italic;
              margin-top: 10px;
              text-align: right;
            }
            .invoice-footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              text-align: center;
              font-size: 11px;
              color: #777;
              line-height: 1.6;
            }
            .invoice-footer a {
              color: #00a0b5;
              text-decoration: none;
            }
            @media print {
              body { background: white; }
              .invoice { margin: 0; padding: 15px; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="invoice">
            <!-- Header -->
            <div class="invoice-header">
              <div class="company-logo">
                <img src="${logo}" alt="Novus Health Labs Logo" />
              </div>
              <div class="invoice-info">
                <p><strong>INVOICE #</strong> ${invoiceNumber}</p>
                <p><strong>PATIENT ID #</strong> ${order?.patient?.id ?? "NA"}</p>
                <p><strong>DATE:</strong> ${invoiceDate}</p>
              </div>
            </div>

            <!-- Details -->
            <div class="details">
              <div class="section">
                <h3>BILLED TO</h3>
                <p><strong>${patientName || "NA"}</strong></p>
                <p>${order?.patient?.age || "NA"} | ${order?.patient?.gender || "NA"}</p>
                <p>${patientAddress}</p>
                <p>Phone: ${order?.patient?.contactNo || "NA"}</p>
                ${
                  order?.refCenter?.name
                    ? `<p><strong>Ref Center:</strong> ${order.refCenter.name}</p>`
                    : ""
                }
                ${
                  order?.doctor?.name
                    ? `<p><strong>Ref Doctor:</strong> Dr. ${order.doctor.name}</p>`
                    : ""
                }
              </div>
              <div class="section">
                <h3>BILL FROM</h3>
                <p><strong>UNNATHI TELEMED PVT LTD</strong></p>
                <p>New No. CH19/1A On, Door No, 1028/3A, Jayalakshmi Vilas Rd, Chamaraja Mohalla, Mysuru, Karnataka 570005</p>
                <p><strong>CIN:</strong> U86905KA20240PC191601</p>
                <p><strong>GSTIN:</strong> 29AADCO6367J1ZQ</p>
              </div>
            </div>

            <!-- Items table — SR, TEST/PACKAGE, PRICE only -->
            <table class="test-table">
              <thead>
                <tr>
                  <th>SR. NO.</th>
                  <th>TEST / PACKAGE</th>
                  <th>PRICE</th>
                </tr>
              </thead>
              <tbody>
                ${patientWiseRows}
              </tbody>
            </table>

            <!-- Footer with paid stamp + totals -->
            <div class="footer">
              <div class="paid-stamp-container">
                <img src="${paidimg}" alt="Paid Stamp" class="paid-stamp-img" />
              </div>
              <div class="total-section">

                <!-- Single subtotal (offer price) -->
                <div class="amount-row">
                  <span class="amount-label">Subtotal:</span>
                  <span class="amount-value">&#8377; ${Number(offerSubtotal).toLocaleString("en-IN")}</span>
                </div>

                ${discount > 0 ? `
                <div class="amount-row">
                  <span class="amount-label">Discount:</span>
                  <span class="amount-value">- &#8377; ${Number(discount).toLocaleString("en-IN")}</span>
                </div>
                ` : ""}

                ${collectionCharge > 0 ? `
                <div class="amount-row">
                  <span class="amount-label">Collection Charge:</span>
                  <span class="amount-value">&#8377; ${Number(collectionCharge).toLocaleString("en-IN")}</span>
                </div>
                ` : ""}

                <div class="total-row">
                  <span class="total-label">Total Amount:</span>
                  <span class="total-value">&#8377; ${Number(payableTotal).toLocaleString("en-IN")}</span>
                </div>

                <div class="amount-in-words">
                  Amount in Words: ${amountInWords}
                </div>

               
              </div>
            </div>

            <div class="invoice-footer">
              <p><strong>Thank you for choosing Novus Health Labs!</strong></p>
              <p>For any queries regarding this invoice, please contact our billing department at
                <a href="mailto:info@novushealth.in">info@novushealth.in</a>
              </p>
              <p>This is a computer-generated invoice. No signature required.</p>
              <p>© ${new Date().getFullYear()} Novus Health Labs. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // ---------------- Puppeteer -> PDF ----------------
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

    await page.setContent(invoiceHtml, { waitUntil: "networkidle0", timeout: 60000 });

    await page.evaluateHandle("document.fonts.ready");
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map(
          (img) =>
            img.complete && img.naturalWidth !== 0
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve;
                }),
        ),
      );
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
      scale: 0.95,
    });

    await browser.close();

    // ---------------- Upload to S3 ----------------
    const key = `invoices/${paymentId}.pdf`;
    const uploadResult = await uploadBufferToS3({
      buffer: pdfBuffer,
      key,
      contentType: "application/pdf",
    });

    console.log("Invoice uploaded successfully to:", uploadResult);
    return uploadResult;
  } catch (error) {
    console.error("Error generating and uploading invoice:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};