// utils/invoiceGenerator.js
const PDFDocument = require("pdfkit");
const path = require("path");

function generateInvoice(order, res) {
  const doc = new PDFDocument({ margin: 50 });

  // Set response headers for PDF
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=invoice_${order.orderNumber}.pdf`);

  // Pipe PDF to response
  doc.pipe(res);

  // ---- Invoice Header ----
  doc
    .fontSize(20)
    .text("INVOICE", { align: "center" })
    .moveDown();

  doc
    .fontSize(12)
    .text(`Order Number: ${order.orderNumber}`)
    .text(`Order Date: ${order.createdAt.toDateString()}`)
    .text(`Payment Method: ${order.paymentMethod}`)
    .moveDown();

  // ---- Customer Details ----
  doc
    .fontSize(14)
    .text("Billing To:", { underline: true })
    .moveDown(0.5);

  doc
    .fontSize(12)
    .text(order.address.fullName)
    .text(order.address.address)
    .text(`${order.address.city}, ${order.address.state}`)
    .text(`Pin Code: ${order.address.pinCode}`)
    .text(`Mobile: ${order.address.mobileNumber}`)
    .moveDown();

  // ---- Order Items Table ----
  doc.fontSize(14).text("Order Items", { underline: true }).moveDown(0.5);

  // Table Header
  doc.fontSize(12).text("Product", 50, doc.y, { width: 200 });
  doc.text("Size", 250, doc.y, { width: 50 });
  doc.text("Qty", 300, doc.y, { width: 50 });
  doc.text("Price", 350, doc.y, { width: 80 });
  doc.text("Total", 430, doc.y, { width: 80 });
  doc.moveDown();

  // Table Rows
  order.items.forEach(item => {
    doc.text(item.productId.productName, 50, doc.y, { width: 200 });
    doc.text(item.size, 250, doc.y, { width: 50 });
    doc.text(item.quantity, 300, doc.y, { width: 50 });
    doc.text(`₹${item.price}`, 350, doc.y, { width: 80 });
    doc.text(`₹${item.totalPrice}`, 430, doc.y, { width: 80 });
    doc.moveDown();
  });

  // ---- Total ----
  doc.moveDown(1);
  doc.fontSize(14).text(`Total Amount: ₹${order.totalAmount}`, { align: "right" });

  // Footer
  doc.moveDown(2);
  doc.fontSize(10).text("Thank you for shopping with us!", { align: "center" });

  // End PDF
  doc.end();
}

module.exports = generateInvoice;
