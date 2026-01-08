import puppeteer from "puppeteer"; // Puppeteer for HTML to PDF conversion
import { uploadBufferToS3 } from "../config/s3.js"; // S3 upload helper
import { PrismaClient } from "@prisma/client"; // Prisma Client

const prisma = new PrismaClient();

/**
 * Generate the invoice PDF and upload it to S3
 * @param {Object} paymentDetails
 * @param {string} paymentDetails.paymentId
 * @param {number} paymentDetails.amount
 * @param {string} paymentDetails.currency
 * @param {string} paymentDetails.patientName
 * @returns {string} invoiceUrl - URL of the uploaded invoice in S3
 */
export const generateAndUploadInvoice = async ({
  paymentId,
  patientName,
  orderId,
}) => {
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
              patient: true, // ✅ important for patient-wise send
              orderMemberPackages: {
                include: {
                  test: {
                    select: { name: true, offerPrice: true, actualPrice: true },
                  }, // Include price for tests
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

    const orderTotal = order.orderMembers.reduce((total, member) => {
      return (
        total +
        member.orderMemberPackages.reduce((packageTotal, omp) => {
          return (
            packageTotal +
            (omp.test?.offerPrice || omp.package?.offerPrice || 0)
          );
        }, 0)
      );
    }, 0);

    // Calculate discount and final total
    const discount = order?.discountAmount || 0; // This could be dynamic based on your logic
    const finalAmount = orderTotal - discount;
    const patientAddress =
      order?.address?.address || order?.patient?.address || "NA";
    
    // Render invoice HTML dynamically
    const invoiceHtml = `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f9f9f9;
              font-size: 12px;
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
            }
            .invoice-header h1 {
              font-size: 24px;
              color: #f39c12;
              margin: 0;
              font-weight: bold;
            }
            .invoice-header .invoice-info {
              text-align: right;
            }
            .invoice-header .invoice-info p {
              margin: 2px 0;
              font-size: 11px;
              color: #555;
            }
            .company-name {
              font-size: 26px;
              font-weight: bold;
              color: #0944b3c9;
              letter-spacing: 0.5px;
            }
            .details {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
            }
            .details .section {
              width: 48%;
            }
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
            .test-table th,
            .test-table td {
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
            .test-table tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .test-table tr:hover {
              background-color: #f5f5f5;
            }
            .footer {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-top: 2px solid #f39c12;
              padding-top: 20px;
              margin-top: 25px;
            }
            /* Circular Stamp Design */
            .paid-stamp-container {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100px;
            }
            .paid-stamp {
              width: 85px;
              height: 85px;
              border: 2px dashed #27ae60;
              border-radius: 50%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              transform: rotate(-12deg);
              font-family: 'Courier New', monospace;
              color: #27ae60;
              text-align: center;
              line-height: 1.2;
              padding: 5px;
              background: white;
              box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
              position: relative;
              overflow: hidden;
            }
            .paid-stamp:before {
              content: '';
              position: absolute;
              width: 120%;
              height: 120%;
              background: radial-gradient(circle, rgba(39, 174, 96, 0.05) 0%, rgba(39, 174, 96, 0) 70%);
              top: -10%;
              left: -10%;
            }
            .paid-stamp .paid-text {
              font-size: 18px;
              font-weight: bold;
              letter-spacing: 2px;
              margin-bottom: 3px;
            }
            .paid-stamp .su-text {
              font-size: 12px;
              font-weight: bold;
              letter-spacing: 1px;
              color: #1e8449;
            }
            .total-section {
              text-align: right;
              min-width: 200px;
            }
            .total-section .amount-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 6px;
              padding-bottom: 4px;
              border-bottom: 1px dotted #ddd;
            }
            .total-section .amount-label {
              font-size: 12px;
              color: #555;
              text-align: left;
              min-width: 100px;
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
            .invoice-footer {
              text-align: center;
              font-size: 10px;
              color: #7f8c8d;
              margin-top: 25px;
              padding-top: 15px;
              border-top: 1px solid #eee;
              line-height: 1.5;
            }
            .invoice-footer p {
              margin: 3px 0;
            }
            .invoice-footer a {
              color: #f39c12;
              text-decoration: none;
            }
            .invoice-footer a:hover {
              text-decoration: underline;
            }
            .note {
              font-size: 11px;
              color: #e74c3c;
              font-style: italic;
              margin-top: 5px;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
                background: white;
              }
              .invoice {
                box-shadow: none;
                margin: 0;
                padding: 10px;
              }
              .paid-stamp {
                box-shadow: none;
                border: 2px dashed #27ae60;
              }
            }
          </style>
        </head>
        <body>
          <div class="invoice">
            <!-- Header -->
            <div class="invoice-header">
              <div class="company-name">NOVUS HEALTH LABS</div>
              <div class="invoice-info">
                <p><strong>INVOICE #</strong> ${paymentId}</p>
                <p><strong>REPORT REF ID #</strong> BLR${paymentId}</p>
                <p><strong>DATE:</strong> ${new Date().toLocaleDateString('en-IN', { 
                  day: '2-digit', 
                  month: 'short', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</p>
              </div>
            </div>

            <!-- Billed To and Bill From Section -->
            <div class="details">
              <div class="section">
                <h3>BILLED TO</h3>
                <p><strong>${patientName}</strong></p>
                <p>${order?.patient?.age || 'NA'} | ${order?.patient?.gender || 'NA'}</p>
                <p>${patientAddress}</p>
                <p>Phone: ${order?.patient?.contactNo || 'NA'}</p>
               
              </div>
              <div class="section">
                <h3>BILL FROM</h3>
                <p><strong>UNNATHI TELEMED PVT LTD</strong></p>
                <p>New No. CH19/1A On, Door No, 1028/3A, Jayalakshmi Vilas Rd, Chamaraja Mohalla, Mysuru, Karnataka 570005</p>
                <p><strong>CIN:</strong> U86905KA20240PC191601</p>
                <p><strong>GSTIN:</strong> 29AADCO6367J1ZQ</p>
                
              
              </div>
            </div>

            <!-- Test Description Table -->
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
                  return order.orderMembers
                    .map((member) =>
                      member.orderMemberPackages
                        .map(
                          (omp) => `  
                            <tr>
                              <td>${counter++}</td>
                              <td>${omp.test?.name || omp.package?.name || "N/A"}</td>
                              <td>₹ ${(omp.test?.offerPrice || omp.package?.offerPrice || 0).toLocaleString('en-IN')}</td>
                            </tr>
                          `
                        )
                        .join(" ")
                    )
                    .join(" ");
                })()}
              </tbody>
            </table>

            <!-- Subtotal, Discount, Total Amount -->
            <div class="footer">
              <div class="paid-stamp-container">
                <div class="paid-stamp">
                  <div class="paid-text">PAID</div>
             
                </div>
              </div>
              <div class="total-section">
                <div class="amount-row">
                  <span class="amount-label">Subtotal:</span>
                  <span class="amount-value">₹ ${orderTotal.toLocaleString('en-IN')}</span>
                </div>
                <div class="amount-row">
                  <span class="amount-label">Discount:</span>
                  <span class="amount-value">- ₹ ${discount.toLocaleString('en-IN')}</span>
                </div>
                <div class="total-row">
                  <span class="total-label">Total Amount:</span>
                  <span class="total-value">₹ ${finalAmount.toLocaleString('en-IN')}</span>
                </div>
                ${finalAmount > 10000 ? `
                <div class="note">
                  * TDS @ 1% applicable as per section 194R
                </div>
                ` : ''}
              </div>
            </div>

            <!-- Footer Notes -->
            <div class="invoice-footer">
              <p><strong>Thank you for choosing Novus Health Labs!</strong></p>
              <p>For any queries regarding this invoice, please contact our billing department at <a href="mailto:info@novushealth.in">info@novushealth.in</a></p>
              <p>This is a computer-generated invoice. No signature required.</p>
              <p>© ${new Date().getFullYear()} Novus Health Labs. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Launch Puppeteer browser instance
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    // Render HTML to PDF using Puppeteer
    const page = await browser.newPage();
    
    // Set page size for better PDF rendering
    await page.setViewport({
      width: 794, // A4 width in pixels at 96 DPI
      height: 1123, // A4 height
      deviceScaleFactor: 1,
    });
    
    await page.setContent(invoiceHtml, { 
      waitUntil: "networkidle0",
      timeout: 30000 
    });

    // Wait for fonts and images to load
    await page.evaluateHandle('document.fonts.ready');

    // Convert the HTML to a PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: '20px',
        bottom: '20px',
        left: '20px',
        right: '20px'
      },
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    });

    await browser.close();

    // Define the S3 key (path) where the invoice will be stored
    const key = `invoices/${paymentId}.pdf`;

    // Upload the PDF to S3
    const uploadResult = await uploadBufferToS3({
      buffer: pdfBuffer,
      key: key,
      contentType: "application/pdf",
    });

    console.log("Invoice uploaded successfully to:", uploadResult);

   

    return uploadResult; // Return the URL of the uploaded invoice
  } catch (error) {
    console.error("Error generating and uploading invoice:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};