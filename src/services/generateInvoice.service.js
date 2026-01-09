import puppeteer from "puppeteer"; // Puppeteer for HTML to PDF conversion
import { uploadBufferToS3 } from "../config/s3.js"; // S3 upload helper
import { PrismaClient } from "@prisma/client"; // Prisma Client

const prisma = new PrismaClient();

/**
 * Generate the invoice PDF and upload it to S3
 * @param {Object} params
 * @param {string} params.paymentId
 * @param {string} params.patientName
 * @param {number|string} params.orderId
 * @returns {Promise<string>} invoiceUrl - URL of the uploaded invoice in S3
 */
export const generateAndUploadInvoice = async ({ paymentId, patientName, orderId }) => {
  // ✅ Public image URLs (no base64 needed)
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
          orderMembers: {
            include: {
              patient: true,
              orderMemberPackages: {
                include: {
                  test: { select: { name: true, offerPrice: true, actualPrice: true } },
                  package: { select: { name: true, offerPrice: true, actualPrice: true } },
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

    // ✅ Calculate totals
    const orderTotal = (order.orderMembers || []).reduce((total, member) => {
      return (
        total +
        (member.orderMemberPackages || []).reduce((packageTotal, omp) => {
          return packageTotal + (omp.test?.offerPrice || omp.package?.offerPrice || 0);
        }, 0)
      );
    }, 0);

    const discount = order?.discountAmount || 0;
    const finalAmount = Math.max(0, orderTotal - discount);

    const patientAddress =
      order?.address?.address || order?.patient?.address || "NA";

    const invoiceDate = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // ✅ Invoice HTML with: logo header + paid stamp image
    const invoiceHtml = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f9f9f9;
              font-size: 12px;
              -webkit-print-color-adjust: exact;
            }
            .invoice {
              width: 100%;
              margin: 0 auto;
              padding: 15px;
              background-color: white;
              box-sizing: border-box;
            }
            .invoice-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #f39c12;
              padding-bottom: 10px;
              margin-bottom: 20px;
              gap: 12px;
            }
            .company-logo img {
              height: 55px;
              max-width: 220px;
              object-fit: contain;
              display: block;
            }
            .invoice-header .invoice-info {
              text-align: right;
              min-width: 240px;
            }
            .invoice-header .invoice-info p {
              margin: 2px 0;
              font-size: 11px;
              color: #555;
            }

            .details {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
              gap: 12px;
            }
            .details .section { width: 48%; }
            .details h3 {
              margin-bottom: 8px;
              font-size: 14px;
              color: #333;
              border-bottom: 1px solid #eee;
              padding-bottom: 3px;
            }
            .details p {
              margin: 4px 0;
              font-size: 12px;
              color: #555;
              line-height: 1.4;
            }

            .test-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
              border: 1px solid #ddd;
            }
            .test-table th, .test-table td {
              padding: 10px 12px;
              border: 1px solid #ddd;
              text-align: left;
              font-size: 12px;
            }
            .test-table th {
              background-color: #f39c12;
              color: white;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .test-table tr:nth-child(even) { background-color: #f9f9f9; }

            .footer {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-top: 2px solid #f39c12;
              padding-top: 20px;
              margin-top: 25px;
              gap: 12px;
            }

            /* ✅ PAID stamp as image */
            .paid-stamp-container {
              min-height: 120px;
              display: flex;
              align-items: flex-start;
              justify-content: flex-start;
              padding-top: 6px;
            }
            .paid-stamp-img {
              width: 115px;
              opacity: 0.85;
              transform: rotate(-15deg);
              display: block;
            }

            .total-section {
              text-align: right;
              min-width: 220px;
              margin-left: auto;
            }
            .total-section .amount-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 6px;
              padding-bottom: 4px;
              border-bottom: 1px dotted #ddd;
              gap: 16px;
            }
            .total-section .amount-label {
              font-size: 12px;
              color: #555;
              text-align: left;
              min-width: 110px;
            }
            .total-section .amount-value {
              font-size: 12px;
              color: #333;
              text-align: right;
              min-width: 90px;
              font-weight: 500;
            }
            .total-section .total-row {
              display: flex;
              justify-content: space-between;
              margin-top: 8px;
              padding-top: 8px;
              border-top: 2px solid #333;
              font-weight: bold;
              gap: 16px;
            }
            .total-section .total-label {
              font-size: 14px;
              color: #2c3e50;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .total-section .total-value {
              font-size: 16px;
              color: #2c3e50;
              font-weight: bold;
            }
            .note {
              font-size: 11px;
              color: #e74c3c;
              font-style: italic;
              margin-top: 6px;
            }

           .invoice-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;

  text-align: center;
  font-size: 10px;
  color: #7f8c8d;

  padding: 12px 15px;
  border-top: 1px solid #eee;
  line-height: 1.5;
  background: white;
}

            .invoice-footer p { margin: 3px 0; }
            .invoice-footer a { color: #f39c12; text-decoration: none; }

            @media print {
              body { margin: 0; padding: 0; background: white; }
              .invoice { box-shadow: none; margin: 0; padding: 10px; }
            }
          </style>
        </head>

        <body>
          <div class="invoice">
            <!-- ✅ Header with LOGO -->
            <div class="invoice-header">
              <div class="company-logo">
                <img src="${logo}" alt="Novus Health Labs Logo" />
              </div>

              <div class="invoice-info">
                <p><strong>INVOICE #</strong> ${paymentId}</p>
                <p><strong>REPORT REF ID #</strong> BLR${paymentId}</p>
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
              </div>

              <div class="section">
                <h3>BILL FROM</h3>
                <p><strong>UNNATHI TELEMED PVT LTD</strong></p>
                <p>New No. CH19/1A On, Door No, 1028/3A, Jayalakshmi Vilas Rd, Chamaraja Mohalla, Mysuru, Karnataka 570005</p>
                <p><strong>CIN:</strong> U86905KA20240PC191601</p>
                <p><strong>GSTIN:</strong> 29AADCO6367J1ZQ</p>
              </div>
            </div>

            <!-- Items table -->
            <table class="test-table">
              <thead>
                <tr>
                  <th>SR. NO.</th>
                  <th>TEST DESCRIPTION</th>
                  <th>PRICE (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  let counter = 1;
                  const rows = (order.orderMembers || [])
                    .flatMap((member) =>
                      (member.orderMemberPackages || []).map((omp) => {
                        const name = omp.test?.name || omp.package?.name || "N/A";
                        const price = omp.test?.offerPrice || omp.package?.offerPrice || 0;
                        return `
                          <tr>
                            <td>${counter++}</td>
                            <td>${name}</td>
                            <td>₹ ${Number(price).toLocaleString("en-IN")}</td>
                          </tr>
                        `;
                      })
                    )
                    .join("");

                  return rows || `
                    <tr>
                      <td>1</td>
                      <td>N/A</td>
                      <td>₹ 0</td>
                    </tr>
                  `;
                })()}
              </tbody>
            </table>

            <!-- Footer totals + ✅ PAID stamp image -->
            <div class="footer">
              <div class="paid-stamp-container">
                <img src="${paidimg}" alt="Paid Stamp" class="paid-stamp-img" />
              </div>

              <div class="total-section">
                <div class="amount-row">
                  <span class="amount-label">Subtotal:</span>
                  <span class="amount-value">₹ ${Number(orderTotal).toLocaleString("en-IN")}</span>
                </div>
                <div class="amount-row">
                  <span class="amount-label">Discount:</span>
                  <span class="amount-value">- ₹ ${Number(discount).toLocaleString("en-IN")}</span>
                </div>
                <div class="total-row">
                  <span class="total-label">Total Amount:</span>
                  <span class="total-value">₹ ${Number(finalAmount).toLocaleString("en-IN")}</span>
                </div>

                ${finalAmount > 10000 ? `<div class="note">* TDS @ 1% applicable as per section 194R</div>` : ""}
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

    // ✅ Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // A4 viewport (helps consistent layout)
    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 1,
    });

    await page.setContent(invoiceHtml, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    // ✅ Ensure fonts ready
    await page.evaluateHandle("document.fonts.ready");

    // ✅ EXTRA SAFE: wait for all images (logo + paid stamp) to finish loading
    await page.evaluate(async () => {
      const imgs = Array.from(document.images || []);
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );
    });

    // ✅ Create PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    });

    await browser.close();

    // ✅ Upload to S3
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
