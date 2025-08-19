const PDFDocument = require("pdfkit");

function drawRow(doc, x, y, row, widths, fontSize = 12) {
  row.forEach((text, i) => {
    doc.fontSize(fontSize)
      .text(text, x, y, { width: widths[i], align: "left" });
    x += widths[i];
  });
}

function generateInvoice(order, res) {
  const doc = new PDFDocument({ margin: 50 });

  // Set response headers for PDF
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=invoice_${order.orderNumber}.pdf`);

  // Pipe PDF to response
  doc.pipe(res);

  // ---- Invoice Header ----
  doc.fontSize(20).text("INVOICE", { align: "center" }).moveDown();

  doc.fontSize(12)
    .text(`Order Number: ${order.orderNumber}`)
    .text(`Order Date: ${order.createdAt.toDateString()}`)
    .text(`Payment Method: ${order.paymentMethod}`)
    .moveDown();

  // ---- Customer Details ----
  doc.fontSize(14).text("Billing To:", { underline: true }).moveDown(0.5);

  doc.fontSize(12)
    .text(order.address.fullName)
    .text(order.address.address)
    .text(`${order.address.city}, ${order.address.state}`)
    .text(`Pin Code: ${order.address.pinCode}`)
    .text(`Mobile: ${order.address.mobileNumber}`)
    .moveDown();

  // ---- Order Items Table ----
  doc.fontSize(14).text("Order Items", { underline: true }).moveDown(0.5);

  // Table columns set-up
  const tableTop = doc.y;
  const colWidths = [180, 60, 60, 70, 70];
  const startX = 50;

  // Table Header
  drawRow(
    doc,
    startX,
    tableTop,
    ["Product", "Size", "Qty", "Price", "Total"],
    colWidths,
    12
  );
  let rowY = tableTop + 20;

  // Table Rows
  (order.items || []).forEach(item => {
    drawRow(
      doc,
      startX,
      rowY,
      [
        item.productId.productName,
        item.size,
        item.quantity.toString(),
        `₹${item.price}`,
        `₹${item.totalPrice}`
      ],
      colWidths,
      12
    );
    rowY += 20;
  });

  // ---- Total ----
  doc.y = rowY + 10;
  doc.fontSize(14).text(`Total Amount: ₹${order.totalAmount}`, { align: "right" });

  // Footer
  doc.moveDown(2);
  doc.fontSize(10).text("Thank you for shopping with us!", { align: "center" });

  // End PDF (this closes response stream)
  doc.end();
}

module.exports = generateInvoice;
