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
    const { startDate, endDate, status = 'all', payment = 'all', page = '1', sort = 'date-newest', search = '', timeRange } = req.query;

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

    const pageNum = parseInt(page, 10) > 0 ? parseInt(page, 10) : 1;
    const limitNum = 5; // Enforce a limit of 5 records per page
    const skip = (pageNum - 1) * limitNum;

    const match = {
      orderStatus: { $nin: ["Failed", "payment-failed"] },
      paymentStatus: { $ne: "Failed_Stock_Issue" }
    };

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

    let sortOption = {};
    switch (sort) {
      case 'date-oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'date-newest':
        sortOption = { createdAt: -1 };
        break;
      // Sorting by amount will be handled after calculations in the pipeline
      // case 'amount-low':
      // case 'amount-high':
      //   break;
      default:
        sortOption = { createdAt: -1 };
        break;
    }

    const allFilteredOrders = await Order.find(match)
      .populate('couponId', 'discountType')
      .populate('items.productId')
      .lean();

    const allSalesData = allFilteredOrders.flatMap(order => {
      const orderDiscount = Number(order.discountAmount) || 0;
      const orderSubtotal = order.items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
      const isFlatCoupon = order.couponId?.discountType === 'flat';
      const totalItemsInOrder = order.items.length > 0 ? order.items.length : 1;

      return order.items.map(item => {
        const itemPrice = Number(item.totalPrice) || 0;
        let itemDiscount = 0;

        if (isFlatCoupon) {
          itemDiscount = orderDiscount / totalItemsInOrder;
        } else {
          itemDiscount = orderSubtotal > 0 ? (itemPrice / orderSubtotal) * orderDiscount : 0;
        }
        const netItemPrice = itemPrice - itemDiscount;

        return {
          productPrice: itemPrice,
          productNetPrice: netItemPrice,
          itemStatus: item.status || order.orderStatus,
        };
      });
    });

    const allRevenueItems = allSalesData.filter(item => ['Delivered', 'Shipped', 'Processing'].includes(item.itemStatus));
    const totalSalesAllPages = allRevenueItems.reduce((acc, item) => acc + item.productPrice, 0);
    const netRevenueAllPages = allRevenueItems.reduce((acc, item) => acc + item.productNetPrice, 0);

    const aggregationPipeline = [
      { $match: match },
      {
        $addFields: {
          // Store the original item count before unwinding
          originalItemCount: { $size: '$items' }
        }
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'items.product'
        }
      },
      { $unwind: { path: '$items.product', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'coupons',
          localField: 'couponId',
          foreignField: '_id',
          as: 'coupon'
        }
      },
      { $unwind: { path: '$coupon', preserveNullAndEmptyArrays: true } }
    ];

    // Apply item status filter after unwinding
    if (status && status !== 'all') {
      aggregationPipeline.push({
        $match: { 'items.status': new RegExp(`^${status}$`, 'i') }
      });
    }

    const countPipeline = [...aggregationPipeline, { $count: 'totalCount' }];
    const countResult = await Order.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

    const dataPipeline = [
      ...aggregationPipeline,
      {
        $addFields: {
          'items.productNetPrice': {
            $let: {
              vars: {
                itemPrice: { $ifNull: ['$items.totalPrice', 0] },
                orderDiscount: { $ifNull: ['$discountAmount', 0] },
                orderSubtotal: { $ifNull: ['$subtotal', 1] }, // Avoid division by zero
                totalItemsInOrder: { $ifNull: ['$originalItemCount', 1] },
                isFlatCoupon: { $eq: ['$coupon.discountType', 'flat'] }
              },
              in: {
                $subtract: [
                  '$$itemPrice',
                  {
                    $cond: {
                      if: '$$isFlatCoupon',
                      then: { $divide: ['$$orderDiscount', '$$totalItemsInOrder'] },
                      else: { $multiply: [{ $divide: ['$$itemPrice', '$$orderSubtotal'] }, '$$orderDiscount'] }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    ];

    const orders = await Order.aggregate(dataPipeline);

    orders.forEach(order => {
      order.couponId = order.coupon;
      order.items.productId = order.items.product;
    });

    if (sort === 'amount-low') {
      orders.sort((a, b) => (a.items.totalPrice || 0) - (b.items.totalPrice || 0));
    } else if (sort === 'amount-high') {
      orders.sort((a, b) => (b.items.totalPrice || 0) - (a.items.totalPrice || 0));
    } else {
      // Default sort if not amount-based
      orders.sort((a, b) => {
        if (sortOption.createdAt) return (new Date(a.createdAt) - new Date(b.createdAt)) * sortOption.createdAt;
        return 0;
      });
    }

    const paginatedOrders = orders.slice(skip, skip + limitNum);

    const salesData = orders.flatMap(order => {
        const orderDiscount = Number(order.discountAmount) || 0;
        const orderSubtotal = Number(order.subtotal) || 0;
        const isFlatCoupon = order.couponId?.discountType === 'flat';
        const totalItemsInOrder = order.originalItemCount > 0 ? order.originalItemCount : 1;

        const item = order.items;
        let itemPrice = Number(item.totalPrice) || 0;
        let itemDiscount = 0;

        if (isFlatCoupon) {
            itemDiscount = orderDiscount / totalItemsInOrder;
        } else {
            itemDiscount = orderSubtotal > 0 ? (itemPrice / orderSubtotal) * orderDiscount : 0;
        }
        let netItemPrice = itemPrice - itemDiscount;

        const isCancelledOrReturned = ['Cancelled', 'Returned'].includes(item.status || order.orderStatus);
        if (isCancelledOrReturned) {
            itemPrice = -Math.abs(itemPrice);
            netItemPrice = -Math.abs(netItemPrice);
        }
        return {
          id: order.orderNumber,
          date: order.createdAt,
          customerName: order.address?.fullName || (order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Unknown'),
          paymentMethod: formatPayment(order.paymentMethod),
          couponUsed: order.couponCode || 'N/A',
          status: order.orderStatus,
          productName: item.productId?.productName || 'Unknown Product',
          productQuantity: Number(item.quantity) || 0,
          productPrice: itemPrice,
          productDiscount: order.discountAmount || 0,
          productNetPrice: netItemPrice,
          itemStatus: item.status || order.orderStatus,
        };
    });


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
                totalNetRevenueAmount: {
                  $sum: {
                    $cond: [
                      { $in: ['$orderStatus', ['Delivered', 'Shipped', 'Processing']] },
                      { $ifNull: ['$totalAmount', 0] },
                      0
                    ]
                  }
                },
                cancelledNet: { $sum: { $cond: [{ $eq: ['$orderStatus', 'Cancelled'] }, { $ifNull: ['$totalAmount', 0] }, 0] } },
              },
            },
          ],
          productsSold: [
            { $unwind: '$items' },
            { $match: { 'items.status': {$in:['Delivered','Processing','Shipped']} } },
            { $group: { _id: null, qty: { $sum: '$items.quantity' } } }
          ],
        },
      },
    ]);

    const totalOrdersAll = agg?.counts?.[0]?.totalOrders || 0;
    const totals = agg?.totals?.[0] || {};
    const productsSoldAll = agg?.productsSold?.[0]?.qty || 0;

    const summary = {
      totalSales: totalSalesAllPages,
      totalOrders: totalOrdersAll,
      productsSold: productsSoldAll,
      totalDiscounts: Number(totals.totalDiscounts || 0),
      netRevenue: netRevenueAllPages,
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
      .populate('couponId', 'discountType') 
      .sort({ createdAt: -1 }) 
      .lean();

    const salesData = orders.flatMap(order => {
      const orderDiscount = Number(order.discountAmount) || 0;
      const orderSubtotal = order.items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
      const isFlatCoupon = order.couponId?.discountType === 'flat';
      const totalItemsInOrder = order.items.length > 0 ? order.items.length : 1;

      return order.items.map(item => {
        let itemPrice = Number(item.totalPrice) || 0;
        let itemDiscount = 0;
        if (isFlatCoupon) {
          itemDiscount = orderDiscount / totalItemsInOrder;
        } else {
          itemDiscount = orderSubtotal > 0 ? (itemPrice / orderSubtotal) * orderDiscount : 0;
        }
        let netItemPrice = itemPrice - itemDiscount;
        const isCancelledOrReturned = ['Cancelled', 'Returned'].includes(item.status || order.orderStatus);
        if (isCancelledOrReturned) netItemPrice = -Math.abs(netItemPrice);

        return {
          id: order.orderNumber,
          date: new Date(order.createdAt).toLocaleDateString(),
          customerName: order.address?.fullName || (order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Unknown'),
          productName: item.productId?.productName || 'Unknown Product',
          productQuantity: item.quantity,
          productNetPrice: `₹${netItemPrice.toFixed(2)}`,
          couponUsed: order.couponCode || 'N/A',
          paymentMethod: formatPayment(order.paymentMethod),
          itemStatus: item.status || order.orderStatus,
        };
      });
    });

    const revenueItems = salesData.filter(item => ['Delivered', 'Shipped', 'Processing'].includes(item.itemStatus));

    const netRevenue = revenueItems.reduce((acc, item) => acc + parseFloat(item.productNetPrice.replace('₹', '')), 0);

    if (salesData.length > 0) {
      salesData.push({
        id: '',
        date: '',
        customerName: '',
        productName: 'Net Revenue',
        productQuantity: '',
        productNetPrice: `₹${netRevenue.toFixed(2)}`,
        couponUsed: '',
        paymentMethod: '',
        itemStatus: '',
      });
    }

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="sales_report.pdf"');
    doc.pipe(res);

    const table = {
      title: 'Sales Report',
      headers: [
        { label: "Order ID", property: 'id', width: 60 },
        { label: "Date", property: 'date', width: 60 },
        { label: "Customer", property: 'customerName', width: 80 },
        { label: "Product", property: 'productName', width: 100 },
        { label: "Qty", property: 'productQuantity', width: 30, renderer: (value) => String(value) },
        { label: "Coupon", property: 'couponUsed', width: 50 },
        { label: "Net Price", property: 'productNetPrice', width: 60 },
        { label: "Payment", property: 'paymentMethod', width: 50 },
        { label: "Status", property: 'itemStatus', width: 60 },
      ],
      datas: salesData,
    };

    await doc.table(table, {
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
        prepareRow: (row, i) => {
          doc.font('Helvetica').fontSize(8);
          if (row.productName === 'Net Revenue') {
            doc.font('Helvetica-Bold');
          }
        },
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
      .populate('couponId', 'discountType') 
      .sort({ createdAt: -1 })
      .lean();

    const salesData = orders.flatMap(order => {
      const orderDiscount = Number(order.discountAmount) || 0;
      const orderSubtotal = order.items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
      const isFlatCoupon = order.couponId?.discountType === 'flat';
      const totalItemsInOrder = order.items.length > 0 ? order.items.length : 1;

      return order.items.map(item => {
        let itemPrice = Number(item.totalPrice) || 0;
        let itemDiscount = 0;
        if (isFlatCoupon) {
          itemDiscount = orderDiscount / totalItemsInOrder;
        } else {
          itemDiscount = orderSubtotal > 0 ? (itemPrice / orderSubtotal) * orderDiscount : 0;
        }
        let netItemPrice = itemPrice - itemDiscount;
        const isCancelledOrReturned = ['Cancelled', 'Returned'].includes(item.status || order.orderStatus);
        if (isCancelledOrReturned) netItemPrice = -Math.abs(netItemPrice);

        return {
          id: order.orderNumber,
          date: new Date(order.createdAt).toLocaleDateString(),
          customerName: order.address?.fullName || (order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Unknown'),
          productName: item.productId?.productName || 'Unknown Product',
          productQuantity: Number(item.quantity) || 0,
          productNetPrice: Number(netItemPrice.toFixed(2)),
          couponUsed: order.couponCode || 'N/A',
          paymentMethod: formatPayment(order.paymentMethod),
          itemStatus: item.status || order.orderStatus,
        };
      });
    });

    const netRevenue = salesData.reduce((acc, item) => {
      if (['Delivered', 'Shipped', 'Processing'].includes(item.itemStatus)) {
        return acc + item.productNetPrice;
      }
      return acc;
    }, 0);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    worksheet.columns = [
      { header: 'Order ID', key: 'id', width: 20 },
      { header: 'Order Date', key: 'date', width: 15 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Product Name', key: 'productName', width: 30 },
      { header: 'Quantity', key: 'productQuantity', width: 10 },
      { header: 'Coupon Used', key: 'couponUsed', width: 15 },
      { header: 'Net Price (₹)', key: 'productNetPrice', width: 15, style: { numFmt: '"₹"#,##0.00' } },
      { header: 'Payment Method', key: 'paymentMethod', width: 15 },
      { header: 'Status', key: 'itemStatus', width: 15 },
    ];

    salesData.forEach(row => {
      worksheet.addRow(row);
    });

    if (salesData.length > 0) {
      worksheet.addRow([]);
      const totalRow = worksheet.addRow({
        productName: 'Net Revenue',
        productNetPrice: netRevenue,
      });
      totalRow.font = { bold: true, size: 12 };
      totalRow.getCell('F').alignment = { horizontal: 'right' };
      totalRow.getCell('G').numFmt = '"₹"#,##0.00';
    }

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

    const salesData = orders.flatMap(order => {
      const orderDiscount = Number(order.discountAmount) || 0;
      const orderSubtotal = order.items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);

      return order.items.map(item => {
        let itemPrice = Number(item.totalPrice) || 0;
        const itemDiscount = orderSubtotal > 0 ? (itemPrice / orderSubtotal) * orderDiscount : 0;
        let netItemPrice = itemPrice - itemDiscount;
        const isCancelledOrReturned = ['Cancelled', 'Returned'].includes(item.status || order.orderStatus);
        if (isCancelledOrReturned) netItemPrice = -Math.abs(netItemPrice);

        return [
          order.orderNumber,
          new Date(order.createdAt).toLocaleDateString(),
          order.address?.fullName || (order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Unknown'),
          item.productId?.productName || 'Unknown Product',
          item.quantity,
          netItemPrice.toFixed(2),
          order.couponCode || 'N/A',
          formatPayment(order.paymentMethod),
          item.status || order.orderStatus,
        ];
      });
    });

    const columns = [
      'Order ID', 'Order Date', 'Customer Name', 'Product Name', 'Quantity', 'Coupon Used',
      'Net Price (₹)', 'Payment Method', 'Status'
    ];
    const stringifier = new Stringifier({ header: true, columns: columns });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sales_report.csv"');

    stringifier.pipe(res);
    salesData.forEach(row => {
      stringifier.write(row);
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
