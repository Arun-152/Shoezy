const Order = require('../../models/orderSchema');
const ExcelJS = require('exceljs');
const { Stringifier } = require('csv-stringify');
const PDFDocument = require("pdfkit-table");

const formatPayment = (pm) => {
  switch (pm) {
    case 'COD': return 'COD';
    case 'Online': return 'Online';
    case 'Wallet': return 'Wallet';
    default: return pm || 'Unknown';
  }
};

const loadSalesReport = async (req, res) => {
  try {
    // Filters and pagination
    const { startDate, endDate, status = 'all', payment = 'all', page = '1', limit = '10', sort = 'date-newest', search = '', timeRange } = req.query;

    let effectiveStartDate = startDate;
    let effectiveEndDate = endDate;

    if (timeRange) {
      const now = new Date();
      let tempStartDate;
      let tempEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999); // End of today

      switch (timeRange) {
        case 'daily':
          tempStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0); // Start of today
          break;
        case 'weekly':
          tempStartDate = new Date(now);
          tempStartDate.setDate(now.getDate() - now.getDay()); // Start of the current week (Sunday)
          tempStartDate.setHours(0, 0, 0, 0);
          break;
        case 'monthly':
          tempStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0); // Start of the current month
          break;
        case 'yearly':
          tempStartDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0); // Start of the current year
          break;
        default:
          // No specific time range, use existing startDate/endDate or no date filter
          break;
      }

      if (tempStartDate) {
        effectiveStartDate = tempStartDate.toISOString().split('T')[0]; // Format for input type="date"
        effectiveEndDate = tempEndDate.toISOString().split('T')[0];
      }
    }

    const pageNum = Math.max(parseInt(page, 5), 1);
    const limitNum = Math.max(parseInt(limit, 5), 1);
    const skip = (pageNum - 1) * limitNum;

    // Base match object to exclude failed online orders from all calculations
    const match = {
      orderStatus: { $nin: ["Failed", "payment-failed"] },
      paymentStatus: { $ne: "Failed_Stock_Issue" }
    };

    // Status filter (case-insensitive exact match)
    if (status && status !== 'all') {
      match.orderStatus = new RegExp(`^${status}$`, 'i');
    }

    // Payment filter (map to schema values)
    if (payment && payment !== 'all') {
      const paymentMap = { online: 'Online', cod: 'COD', wallet: 'Wallet' };
      match.paymentMethod = paymentMap[String(payment).toLowerCase()] || payment;
    }

    // Search filter for user details
    if (search && search.trim() !== '') {
      const escapeRegex = str => str.replace(/[.*+?^${}()|[\\]/g, '\\$&');
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [
        { 'address.fullName': regex },
        { orderNumber: regex },
      ];
    }



    // Date range filter
    if (effectiveStartDate || effectiveEndDate) {
      match.createdAt = {};
      if (effectiveStartDate) match.createdAt.$gte = new Date(effectiveStartDate);
      if (effectiveEndDate) {
        const end = new Date(effectiveEndDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    // Sort options
    let sortOption = {};
    switch (sort) {
      case 'date-oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'amount-low':
        sortOption = { totalAmount: 1 };
        break;
      case 'amount-high':
        sortOption = { totalAmount: -1 };
        break;
      case 'date-newest':
      default:
        sortOption = { createdAt: -1 };
        break;
    }

    // Total count for pagination
    const totalCount = await Order.countDocuments(match);

    // Fetch orders
    const orders = await Order.find(match)
      .populate('userId', 'firstName lastName email')
      .populate('items.productId')
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Convert orders to front-end friendly salesData
    const salesData = orders.map(order => {
      const isCancelledOrReturned = order.orderStatus === 'Cancelled' || order.orderStatus === 'Returned';
      const totalAmount = isCancelledOrReturned ? 0 : (Number(order.totalAmount) || 0);
      const discount = isCancelledOrReturned ? 0 : (Number(order.discountAmount) || 0);
      const netPaidAmount = isCancelledOrReturned ? 0 : (Number(order.totalAmount - discount) || 0);

      return {
        id: order.orderNumber,
        date: order.createdAt,
        customerName: order.address?.fullName || (order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Unknown'),
        customerEmail: order.userId?.email || 'N/A',
        paymentMethod: formatPayment(order.paymentMethod),
        couponUsed: order.couponCode || '',
        totalAmount: totalAmount,
        discount: discount,
        netPaidAmount: netPaidAmount,
        status: order.orderStatus,
        products: order.items.map(item => ({
          name: item.productId?.productName || 'Unknown Product',
          quantity: Number(item.quantity) || 0,
          price: Number(item.totalPrice) || 0,
        })),
      };
    });

    // Aggregate summary data
    const [agg] = await Order.aggregate([
      { $match: match },
      {
        $facet: {
          counts: [{ $count: 'totalOrders' }],
          totals: [
            {
              $group: {
                _id: null,
                totalAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
                totalDiscounts: { $sum: { $ifNull: ['$discountAmount', 0] } },
                totalSalesAmount: {
                  $sum: {
                    $cond: [
                      { $not: { $in: ['$orderStatus', ['Cancelled', 'Returned']] } },
                      { $ifNull: ['$totalAmount', 0] },
                      0
                    ]
                  }
                },
                totalNetRevenueAmount: {
                  $sum: {
                    $cond: [
                      { $not: { $in: ['$orderStatus', ['Cancelled', 'Returned']] } },
                      { $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: ['$discountAmount', 0] }] },
                      0
                    ]
                  }
                },
                cancelledNet: { $sum: { $cond: [{ $eq: ['$orderStatus', 'Cancelled'] }, { $ifNull: ['$totalAmount', 0] }, 0] } },
              },
            },
          ],
          productsSold: [
            { $match: { orderStatus: { $nin: ['Cancelled', 'Returned'] } } },
            { $unwind: '$items' },
            { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
          ],
        },
      },
    ]);

    const totalOrdersAll = agg?.counts?.[0]?.totalOrders || 0;
    const totals = agg?.totals?.[0] || {};
    const productsSoldAll = agg?.productsSold?.[0]?.qty || 0;

    const summary = {
      totalSales: Number(totals.totalSalesAmount || 0),
      totalOrders: totalOrdersAll,
      productsSold: productsSoldAll,
      totalDiscounts: Number(totals.totalDiscounts || 0),
      totalReturns: 0,
      netRevenue: Number(totals.totalNetRevenueAmount || 0),
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / limitNum));

    return res.render('admin/adminsalesreportPage', {
      salesData,
      summary,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
      },
      filters: {
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        status,
        payment,
        search,
        sort,
        timeRange,
      },
    });
  } catch (error) {
    console.error('Error loading sales report:', error);
    return res.status(500).render('admin/adminerrorPage', {
      message: 'Failed to load sales report',
    });
  }
};

const exportPdfReport = async (req, res) => {
  try {
    const { startDate, endDate, status, payment, search, timeRange } = req.query;

    let effectiveStartDate = startDate;
    let effectiveEndDate = endDate;

    if (timeRange) {
      const now = new Date();
      let tempStartDate;
      let tempEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      switch (timeRange) {
        case 'daily':
          tempStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          break;
        case 'weekly':
          tempStartDate = new Date(now);
          tempStartDate.setDate(now.getDate() - now.getDay());
          tempStartDate.setHours(0, 0, 0, 0);
          break;
        case 'monthly':
          tempStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'yearly':
          tempStartDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          break;
      }

      if (tempStartDate) {
        effectiveStartDate = tempStartDate.toISOString().split('T')[0];
        effectiveEndDate = tempEndDate.toISOString().split('T')[0];
      }
    }

    const match = {
      orderStatus: { $nin: ["Failed", "payment-failed"] },
      paymentStatus: { $ne: "Failed_Stock_Issue" }
    };

    if (status && status !== 'all') {
      match.orderStatus = new RegExp(`^${status}$`, 'i');
    }

    if (payment && payment !== 'all') {
      const paymentMap = { online: 'Online', cod: 'COD', wallet: 'Wallet' };
      match.paymentMethod = paymentMap[String(payment).toLowerCase()] || payment;
    }

    if (search && search.trim() !== '') {
      const escapeRegex = str => str.replace(/[.*+?^${}()|[\\]/g, '\\$&');
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [
        { 'address.fullName': regex },
        { orderNumber: regex },
      ];
    }

    if (effectiveStartDate || effectiveEndDate) {
      match.createdAt = {};
      if (effectiveStartDate) match.createdAt.$gte = new Date(effectiveStartDate);
      if (effectiveEndDate) {
        const end = new Date(effectiveEndDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    const orders = await Order.find(match)
      .populate('userId', 'firstName lastName email')
      .populate('items.productId')
      .sort({ createdAt: -1 }) // Default sort for exports
      .lean();

    const salesData = orders.map(order => {
      const isCancelledOrReturned = order.orderStatus === 'Cancelled' || order.orderStatus === 'Returned';
      const totalAmount = isCancelledOrReturned ? 0 : (Number(order.totalAmount) || 0);
      const discount = isCancelledOrReturned ? 0 : (Number(order.discountAmount) || 0);
      const netPaidAmount = isCancelledOrReturned ? 0 : (Number(order.totalAmount - discount) || 0);

      return {
        id: order.orderNumber,
        date: new Date(order.createdAt).toLocaleDateString(),
        customerName: order.address?.fullName || (order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Unknown'),
        paymentMethod: formatPayment(order.paymentMethod),
        couponUsed: order.couponCode || 'N/A',
        totalAmount: `₹${totalAmount.toFixed(2)}`,
        discount: `₹${discount.toFixed(2)}`,
        netPaidAmount: `₹${netPaidAmount.toFixed(2)}`,
        status: order.orderStatus,
        products: order.items.map(item => `${item.productId?.productName || 'Unknown Product'} (Qty: ${item.quantity}, Price: ${item.totalPrice.toFixed(2)})`).join('\n'),
      };
    });

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="sales_report.pdf"');
    doc.pipe(res);

    const table = {
      title: 'Sales Report',
      headers: [
        { label: "Order ID", property: 'id', width: 40 },
        { label: "Order Date", property: 'date', width: 40 },
        { label: "Customer Name", property: 'customerName', width: 60 },
        { label: "Payment Method", property: 'paymentMethod', width: 40 },
        { label: "Coupon Used", property: 'couponUsed', width: 40 },
        { label: "Total Amount", property: 'totalAmount', width: 45 },
        { label: "Discount", property: 'discount', width: 40 },
        { label: "Net Paid", property: 'netPaidAmount', width: 45 },
        { label: "Order Status", property: 'status', width: 40 },
        { label: "Products", property: 'products', width: 140 },
      ],
      datas: salesData,
    };

    await doc.table(table, {
        prepareHeader: () => doc.font('Helvetica-Bold'),
        prepareRow: (row, i) => doc.font('Helvetica').fontSize(8),
     });

    doc.end();

  } catch (error) {
    console.error('Error exporting PDF sales report:', error);
    res.status(500).send('Error generating PDF report');
  }
};

const exportExcelReport = async (req, res) => {
  try {
    const { startDate, endDate, status, payment, search, sort, timeRange } = req.query;

    let effectiveStartDate = startDate;
    let effectiveEndDate = endDate;

    if (timeRange) {
      const now = new Date();
      let tempStartDate;
      let tempEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      switch (timeRange) {
        case 'daily':
          tempStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          break;
        case 'weekly':
          tempStartDate = new Date(now);
          tempStartDate.setDate(now.getDate() - now.getDay());
          tempStartDate.setHours(0, 0, 0, 0);
          break;
        case 'monthly':
          tempStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'yearly':
          tempStartDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          break;
      }

      if (tempStartDate) {
        effectiveStartDate = tempStartDate.toISOString().split('T')[0];
        effectiveEndDate = tempEndDate.toISOString().split('T')[0];
      }
    }

    const match = {
      orderStatus: { $nin: ["Failed", "payment-failed"] },
      paymentStatus: { $ne: "Failed_Stock_Issue" }
    };

    if (status && status !== 'all') {
      match.orderStatus = new RegExp(`^${status}$`, 'i');
    }

    if (payment && payment !== 'all') {
      const paymentMap = { online: 'Online', cod: 'COD', wallet: 'Wallet' };
      match.paymentMethod = paymentMap[String(payment).toLowerCase()] || payment;
    }

    if (search && search.trim() !== '') {
      const escapeRegex = str => str.replace(/[.*+?^${}()|[\\]/g, '\\$&');
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [
        { 'address.fullName': regex },
        { orderNumber: regex },
      ];
    }

    if (effectiveStartDate || effectiveEndDate) {
      match.createdAt = {};
      if (effectiveStartDate) match.createdAt.$gte = new Date(effectiveStartDate);
      if (effectiveEndDate) {
        const end = new Date(effectiveEndDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    const orders = await Order.find(match)
      .populate('userId', 'firstName lastName email')
      .populate('items.productId')
      .sort({ createdAt: -1 })
      .lean();

    const salesData = orders.map(order => {
      const isCancelledOrReturned = order.orderStatus === 'Cancelled' || order.orderStatus === 'Returned';
      const totalAmount = isCancelledOrReturned ? 0 : (Number(order.totalAmount) || 0);
      const discount = isCancelledOrReturned ? 0 : (Number(order.discountAmount) || 0);
      const netPaidAmount = isCancelledOrReturned ? 0 : (Number(order.totalAmount - discount) || 0);

      return {
        id: order.orderNumber,
        date: new Date(order.createdAt).toLocaleDateString(),
        customerName: order.address?.fullName || (order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Unknown'),
        paymentMethod: formatPayment(order.paymentMethod),
        couponUsed: order.couponCode || 'N/A',
        totalAmount: totalAmount.toFixed(2),
        discount: discount.toFixed(2),
        netPaidAmount: netPaidAmount.toFixed(2),
        status: order.orderStatus,
        products: order.items.map(item => `${item.productId?.productName || 'Unknown Product'} (Qty: ${item.quantity}, Price: ${item.totalPrice.toFixed(2)})`).join(', '),
      };
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    worksheet.columns = [
      { header: 'Order ID', key: 'id', width: 20 },
      { header: 'Order Date', key: 'date', width: 15 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Payment Method', key: 'paymentMethod', width: 20 },
      { header: 'Coupon Used', key: 'couponUsed', width: 15 },
      { header: 'Total Amount (₹)', key: 'totalAmount', width: 15 },
      { header: 'Discount (₹)', key: 'discount', width: 15 },
      { header: 'Net Paid Amount (₹)', key: 'netPaidAmount', width: 20 },
      { header: 'Order Status', key: 'status', width: 15 },
      { header: 'Products List', key: 'products', width: 50 },
    ];

    salesData.forEach(row => {
      worksheet.addRow(row);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sales_report.xlsx"');

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error exporting Excel sales report:', error);
    res.status(500).send('Error generating Excel report');
  }
};

const exportCsvReport = async (req, res) => {
  try {
    const { startDate, endDate, status, payment, search, sort, timeRange } = req.query;

    let effectiveStartDate = startDate;
    let effectiveEndDate = endDate;

    if (timeRange) {
      const now = new Date();
      let tempStartDate;
      let tempEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      switch (timeRange) {
        case 'daily':
          tempStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
          break;
        case 'weekly':
          tempStartDate = new Date(now);
          tempStartDate.setDate(now.getDate() - now.getDay());
          tempStartDate.setHours(0, 0, 0, 0);
          break;
        case 'monthly':
          tempStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          break;
        case 'yearly':
          tempStartDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          break;
        default:
          break;
      }

      if (tempStartDate) {
        effectiveStartDate = tempStartDate.toISOString().split('T')[0];
        effectiveEndDate = tempEndDate.toISOString().split('T')[0];
      }
    }

    const match = {
      orderStatus: { $nin: ["Failed", "payment-failed"] },
      paymentStatus: { $ne: "Failed_Stock_Issue" }
    };

    if (status && status !== 'all') {
      match.orderStatus = new RegExp(`^${status}$`, 'i');
    }

    if (payment && payment !== 'all') {
      const paymentMap = { online: 'Online', cod: 'COD', wallet: 'Wallet' };
      match.paymentMethod = paymentMap[String(payment).toLowerCase()] || payment;
    }

    if (search && search.trim() !== '') {
      const escapeRegex = str => str.replace(/[.*+?^${}()|[\\]/g, '\\$&');
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [
        { 'address.fullName': regex },
        { orderNumber: regex },
      ];
    }

    if (effectiveStartDate || effectiveEndDate) {
      match.createdAt = {};
      if (effectiveStartDate) match.createdAt.$gte = new Date(effectiveStartDate);
      if (effectiveEndDate) {
        const end = new Date(effectiveEndDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    const orders = await Order.find(match)
      .populate('userId', 'firstName lastName email')
      .populate('items.productId')
      .sort({ createdAt: -1 })
      .lean();

    const salesData = orders.map(order => {
      const isCancelledOrReturned = order.orderStatus === 'Cancelled' || order.orderStatus === 'Returned';
      const totalAmount = isCancelledOrReturned ? 0 : (Number(order.totalAmount) || 0);
      const discount = isCancelledOrReturned ? 0 : (Number(order.discountAmount) || 0);
      const netPaidAmount = isCancelledOrReturned ? 0 : (Number(order.totalAmount - discount) || 0);

      return {
        id: order.orderNumber,
        date: new Date(order.createdAt).toLocaleDateString(),
        customerName: order.address?.fullName || (order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Unknown'),
        paymentMethod: formatPayment(order.paymentMethod),
        couponUsed: order.couponCode || 'N/A',
        totalAmount: totalAmount.toFixed(2),
        discount: discount.toFixed(2),
        netPaidAmount: netPaidAmount.toFixed(2),
        status: order.orderStatus,
        products: order.items.map(item => `${item.productId?.productName || 'Unknown Product'} (Qty: ${item.quantity}, Price: ${item.totalPrice.toFixed(2)})`).join(', '),
      };
    });

    const columns = [
      'Order ID', 'Order Date', 'Customer Name', 'Payment Method', 'Coupon Used',
      'Total Amount (₹)', 'Discount (₹)', 'Net Paid Amount (₹)', 'Order Status', 'Products List'
    ];
    const stringifier = new Stringifier({ header: true, columns: columns });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sales_report.csv"');

    stringifier.pipe(res);
    salesData.forEach(row => {
      stringifier.write([
        row.id, row.date, row.customerName, row.paymentMethod, row.couponUsed,
        row.totalAmount, row.discount, row.netPaidAmount, row.status, row.products
      ]);
    });
    stringifier.end();

  } catch (error) {
    console.error('Error exporting CSV sales report:', error);
    res.status(500).send('Error generating CSV report');
  }
};

module.exports = {
  loadSalesReport,
  exportPdfReport,
  exportExcelReport,
  exportCsvReport,
};
