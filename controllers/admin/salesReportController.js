const Order = require('../../models/orderSchema');

const loadSalesReport = async (req, res) => {
  try {
    // Filters and pagination
    const { startDate, endDate, status = 'all', payment = 'all', page = '1', limit = '10', sort = 'date-newest', search = '' } = req.query;
    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.max(parseInt(limit, 10), 1);
    const skip = (pageNum - 1) * limitNum;

    const match = {};

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
      const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapeRegex(search), 'i');
      match.$or = [
        { 'address.fullName': regex },
        { orderNumber: regex },
      ];
    }

    // Date range filter
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
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

    // Format payment method for display
    const formatPayment = (pm) => {
      switch (pm) {
        case 'COD': return 'COD';
        case 'Online': return 'Online';
        case 'Wallet': return 'Wallet';
        default: return pm || 'Unknown';
      }
    };

    // Convert orders to front-end friendly salesData
    const salesData = orders.map(order => ({
      id: order.orderNumber,
      date: order.createdAt,
      customerName: order.address?.fullName || (order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Unknown'),
      customerEmail: order.userId?.email || 'N/A',
      paymentMethod: formatPayment(order.paymentMethod),
      couponUsed: order.couponCode || '',
      totalAmount: Number(order.totalAmount) || 0,
      discount: Number(order.discountAmount) || 0,
      netPaidAmount: Number(order.totalAmount - (order.discountAmount || 0)) || 0,
      status: order.orderStatus,
      products: order.items.map(item => ({
        name: item.productId?.productName || 'Unknown Product',
        quantity: Number(item.quantity) || 0,
        price: Number(item.totalPrice) || 0,
      })),
    }));

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
                deliveredSales: { $sum: { $cond: [{ $eq: ['$orderStatus', 'Delivered'] }, { $ifNull: ['$totalAmount', 0] }, 0] } },
                cancelledNet: { $sum: { $cond: [{ $eq: ['$orderStatus', 'Cancelled'] }, { $ifNull: ['$totalAmount', 0] }, 0] } },
                footerNetRevenue: { $sum: { $cond: [{ $ne: ['$orderStatus', 'Cancelled'] }, { $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: ['$discountAmount', 0] }] }, 0] } },
              },
            },
          ],
          productsSold: [
            { $match: { orderStatus: 'Delivered' } },
            { $unwind: '$items' },
            { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
          ],
        },
      },
    ]);

    const totalOrdersAll = agg?.counts?.[0]?.totalOrders || 0;
    const totals = agg?.totals?.[0] || {};
    const productsSold = agg?.productsSold?.[0]?.qty || 0;

    const summary = {
      totalSales: Number(totals.deliveredSales || 0),
      totalOrders: totalOrdersAll,
      productsSold,
      totalDiscounts: Number(totals.totalDiscounts || 0),
      totalReturns: Number(totals.cancelledNet || 0),
      netRevenue: Number(totals.footerNetRevenue || 0),
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / limitNum));

    return res.render('admin/admin-sales-report', {
      salesData,
      summary,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
      },
      filters: {
        startDate,
        endDate,
        status,
        payment,
        search,
        sort,
      },
    });
  } catch (error) {
    console.error('Error loading sales report:', error);
    return res.status(500).render('admin/internalServer-error', {
      message: 'Failed to load sales report',
    });
  }
};

module.exports = {
  loadSalesReport,
};