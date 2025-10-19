const PDFDocument = require("pdfkit");

function generateInvoice(order, res) {
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=invoice_${order.orderNumber}.pdf`);

  doc.pipe(res);

  // --- Helper Functions ---
  const drawLine = (y) => doc.strokeColor("#dddddd").lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
  const formatCurrency = (amount) => `${amount.toFixed(2)}`;

  // --- Header ---
  doc.fontSize(20).font('Helvetica-Bold').text("Shoezy", 50, 50);
  doc.fontSize(10).font('Helvetica').text("123 Shoe Lane, Sneaker City, ST 12345");
  doc.text("contact@shoezy.com | +91 98765 43210").moveDown(2);

  doc.fontSize(20).font('Helvetica-Bold').text("INVOICE", 400, 50, { align: "right" });
  doc.fontSize(10).font('Helvetica').text(`Invoice #: ${order.orderNumber}`, { align: "right" });
  doc.text(`Date: ${order.createdAt.toLocaleDateString('en-IN')}`, { align: "right" }).moveDown(2);

  // --- Customer Details ---
  doc.fontSize(12).font('Helvetica-Bold').text("Bill To");
  drawLine(doc.y + 5);
  doc.moveDown();
  doc.fontSize(10).font('Helvetica').text(order.address.fullName);
  doc.text(order.address.address);
  doc.text(`${order.address.city}, ${order.address.state} - ${order.address.pinCode}`);
  if (order.userId && order.userId.email) {
    doc.text(order.userId.email);
  }
  doc.text(order.address.mobileNumber).moveDown(2);

  // --- Order Items Table ---
  const tableTop = doc.y;
  doc.fontSize(12).font('Helvetica-Bold').text("Order Summary");
  drawLine(doc.y + 5);
  doc.moveDown();

  const tableHeaders = ["Product", "Size", "Qty", "Status", "Price", "Total"];
  const columnWidths = [180, 50, 40, 70, 80, 80];
  let currentY = doc.y;
  let currentX = 50;

  // Draw table headers
  tableHeaders.forEach((header, i) => {
    doc.font('Helvetica-Bold').fontSize(10).text(header, currentX, currentY, { width: columnWidths[i] });
    currentX += columnWidths[i];
  });
  currentY += 20;
  drawLine(currentY);

  let subtotal = 0;

  // Draw table rows
  order.items.forEach(item => {
    currentY += 10;
    currentX = 50;
    const itemSubtotal = item.price * item.quantity;
    subtotal += itemSubtotal;

    const rowData = [
      item.productId.productName,
      item.size,
      item.quantity.toString(),
      item.status,
      formatCurrency(item.price),
      formatCurrency(itemSubtotal)
    ];

    rowData.forEach((cell, i) => {
      doc.font('Helvetica').fontSize(10).text(cell, currentX, currentY, { width: columnWidths[i] });
      currentX += columnWidths[i];
    });
    currentY += 20; // Move to next line
  });

  drawLine(currentY);

  // --- Totals Section ---
  const totalsX = 380;
  const labelWidth = 100;
  const valueWidth = 70;
  let totalsY = currentY + 20;
  
  const drawTotalRow = (label, value, options = {}) => {
    const { font = 'Helvetica', color = 'black', isBold = false } = options;
    const finalFont = isBold ? font + '-Bold' : font;
  
    doc.font(finalFont).fillColor(color).fontSize(10)
       .text(label, totalsX, totalsY, { width: labelWidth, align: 'right' });
    doc.font(finalFont).fillColor(color).fontSize(10)
       .text(value, totalsX + labelWidth + 10, totalsY, { width: valueWidth, align: 'right' });
  
    totalsY += 15;
  };
  
  drawTotalRow("Subtotal:", formatCurrency(subtotal));
  
  if (order.discountAmount && order.discountAmount > 0) {
    drawTotalRow(
      `Discount (${order.couponCode}):`,
      `- ${formatCurrency(order.discountAmount)}`,
      { color: '#28a745', isBold: true }
    );
  }
  
  // Reset font and color for the line and grand total
  doc.font('Helvetica').fillColor('black');
  doc.strokeColor("#333333").lineWidth(1).moveTo(totalsX, totalsY).lineTo(550, totalsY).stroke();
  totalsY += 10;
  
  drawTotalRow("Grand Total:", formatCurrency(order.totalAmount), { font: 'Helvetica', isBold: true });

  // --- Footer ---
  const pageHeight = doc.page.height;
  doc.font('Helvetica-Oblique').fontSize(10).text("Thank you for your purchase!", 50, pageHeight - 50, {
    align: 'center',
    width: 500
  });

  doc.end();
}

module.exports = generateInvoice;
