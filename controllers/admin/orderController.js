const mongoose = require("mongoose");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Order = require("../../models/orderSchema");
const Wallet = require("../../models/walletSchema")
const Coupon = require("../../models/CouponSchema")
const { resetCouponUsage } = require('../user/couponController');
require("dotenv").config();

const calculateOrderTotals = (order) => {
    let subtotal = 0;
    let activeItemsCount = 0;
    const originalItemsCount = order.items.length;

    order.items.forEach(item => {
        if (item.status !== 'Returned' && item.status !== 'Cancelled') {
            subtotal += item.totalPrice;
            activeItemsCount++;
        }
    });

    let couponDiscount = 0;
    if (order.discountAmount && order.discountAmount > 0) {
        const wasFlatCoupon = order.couponCode && order.couponCode.discountType === 'flat';
        const wasPercentageCoupon = order.couponCode && order.couponCode.discountType === 'percentage';

        if (wasFlatCoupon) {
            const couponSharePerItem = order.discountAmount / originalItemsCount;
            couponDiscount = couponSharePerItem * activeItemsCount;
        } else if (wasPercentageCoupon) {
            const percentage = order.couponCode.offerPrice;
            couponDiscount = (subtotal * percentage) / 100;
        } else {
            const couponSharePerItem = order.discountAmount / originalItemsCount;
            couponDiscount = couponSharePerItem * activeItemsCount;
        }
    }

    const finalAmount = subtotal - couponDiscount;

    return {
        subtotal,
        couponDiscount,
        finalAmount
    };
};

const ordersPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const sort = req.query.sort || 'date_desc';

    const query = {};
    if (search) {
        query.$or = [
            { orderNumber: { $regex: search, $options: 'i' } },
            { 'userId.fullname': { $regex: search, $options: 'i' } },
            { 'userId.email': { $regex: search, $options: 'i' } }
        ];
    }

    const sortOptions = {};
    switch (sort) {
        case 'date_asc':
            sortOptions.createdAt = 1;
            break;
        case 'amount_desc':
            sortOptions.finalAmount = -1;
            break;
        case 'amount_asc':
            sortOptions.finalAmount = 1;
            break;
        default:
            sortOptions.createdAt = -1;
            break;
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find(query)
      .populate("userId", "fullname email")
      .populate("couponCode")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    const ordersWithTotals = orders.map(order => {
        const totals = calculateOrderTotals(order);
        return {
            ...order.toObject(),
            ...totals
        };
    });

    res.render("admin/adminordersPage", {
      orders: ordersWithTotals,
      currentPage: page,
      totalPages,
      totalOrders,
      search,
      sort
    });
  } catch (error) {
    console.error("Error rendering orders page:", error.message);
    res.redirect("/admin/adminErrorPage");
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { status, reason } = req.body; 
    const orderId = req.params.orderId;

    // Validate order ID
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid or missing order ID" });
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Check if order is locked (payment failed orders)
    if (order.isLocked) {
      return res.status(400).json({
        success: false,
        message: "Cannot update status for locked orders (payment failed). This order is protected from status changes.",
      });
    }

    // Check if order has payment-failed status
    if (order.orderStatus === "payment-failed") {
      return res.status(400).json({
        success: false,
        message: "Cannot update status for payment failed orders. These orders are locked for security.",
      });
    }

    // Check if online payment is pending or failed
    if (order.paymentMethod && order.paymentMethod.toLowerCase() === "online") {
      if (order.paymentStatus === "pending" || order.paymentStatus === "failed") {
        return res.status(400).json({
          success: false,
          message: `Cannot update status for orders with ${order.paymentStatus} online payment. Payment must be completed first.`,
        });
      }
    }

    // Check if order is already delivered
    if (order.orderStatus.toLowerCase() === "delivered") {
      return res.status(400).json({
        success: false,
        message: "Cannot update status for a delivered order",
      });
    }

    // Validate status
    const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled", "Paid"];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    // For cancellation, ensure reason is provided
    if (status.toLowerCase() === "cancelled" && !reason) {
      return res.status(400).json({ success: false, message: "Cancellation reason is required" });
    }

    // Update order status
    order.orderStatus = status;

    // Update item statuses
    order.items.forEach((item) => {
      if (!["Cancelled", "Returned", "cancelled", "returned"].includes(item.status)) {
        item.status = status;
      }
    });

    // Handle delivered status
    if (status.toLowerCase() === "delivered") {
      order.paymentStatus = "Paid";
      order.deliveryDate = new Date();
    }
    

    // Handle cancellation
    if (status.toLowerCase() === "cancelled") {
      order.cancellationReason = reason;
      
      // Reset coupon usage if order had a coupon
      if (order.couponId && order.userId) {
        try {
          await resetCouponUsage(order.couponId, order.userId, order._id);
          console.log(`Coupon usage reset for cancelled order ${order._id}`);
        } catch (error) {
          console.error("Error resetting coupon usage for cancelled order:", error);
        }
      }
    }

    // Add to status history
    order.statusHistory.push({
      status,
      date: new Date(),
      description: status.toLowerCase() === "cancelled" ? reason : undefined,
    });

    // Save the order
    await order.save();

    res.json({ success: true, message: "Status updated successfully" });
  } catch (error) {
    console.error("Error updating order status:", error.message);
    res.status(500).json({ success: false, message: "Server error updating status" });
  }
}

const orderDetails = async (req, res) => {
  const { orderId } = req.params

  try {
    const order = await Order.findOne({ _id: orderId, paymentStatus: { $ne: "Failed_Stock_Issue" }, orderStatus: { $ne: "Failed" } }) // Exclude orders that failed due to stock or other general failures
      .populate('items.productId')
      .populate('userId')
      .populate('couponId')

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Calculate order totals including coupon discount
    const totals = calculateOrderTotals(order);

    res.render('adminOrderDetailsPage', {
      order,
      totals
    });
  } catch (error) {
    console.error('Error loading admin order details:', error);
    res.status(500).render('admin/500', { message: 'Server error' });
  }
}
const viewReturnRequests = async (req, res) => {
  try {
    // Fetch orders that contain at least one item with return requested
    const returnedOrders = await Order.find({ "items.status": "ReturnRequested" })
      .populate("userId")
      .populate("items.productId")
      .sort({ updatedAt: -1 });

    res.render("viewRequestPage", {
      title: "Return Requests",
      returnedOrders,
    });
  } catch (error) {
    console.error("Error loading return requests:", error);
    res.status(500).render("error/admin500", {
      title: "Server Error",
      message: "Failed to load return requests.",
    });
  }
};

const approveReturnRequest = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const order = await Order.findOne({ orderNumber: orderId }).populate("items.productId");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    let refundAmount = 0;
    let updatedProducts = [];
    let productFound = false;

    // Calculate total before discount
    const orderTotalBeforeDiscount = order.items.reduce(
      (sum, item) => sum + (item.price * item.quantity),
      0
    );

    // Fetch coupon if applied
    let coupon = null;
    if (order.couponId) {
      coupon = await Coupon.findById(order.couponId);
    }

    // Process the specific return request
    order.items = order.items.map(item => {
      if (item.productId._id.toString() === productId && item.status === "ReturnRequested") {
        item.status = "Returned";
        productFound = true;

        // Refund for all payment methods (COD + Online + Wallet)
        let baseRefund = item.totalPrice;

        if (order.couponId && order.discountAmount > 0) {
          let discountShare = 0;
          if (coupon && coupon.discountType === "flat") {
            const itemCount = order.items.length || 1;
            const flatPerItem = order.discountAmount / itemCount;
            discountShare = flatPerItem;
          } else if (orderTotalBeforeDiscount > 0) {
            discountShare = ((item.price * item.quantity) / orderTotalBeforeDiscount) * order.discountAmount;
          }
          baseRefund -= discountShare;
          if (baseRefund < 0) baseRefund = 0;
        }

        refundAmount += baseRefund;

        updatedProducts.push({
          name: item.productId.productName || "Unknown Product",
          quantity: item.quantity || 1,
          size: item.size,
          refund: refundAmount.toFixed(2)
        });
      }
      return item;
    });

    if (!productFound) {
      return res.status(400).json({
        success: false,
        message: "Product return request not found or already processed"
      });
    }

    // Check if all items are returned/cancelled
    let allOrderReturn = order.items.every(item => item.status === "Returned" || item.status === "Cancelled");
    if (allOrderReturn) {
      order.orderStatus = "Returned";
      
      // Reset coupon usage if order had a coupon
      if (order.couponId && order.userId) {
        try {
          await resetCouponUsage(order.couponId, order.userId, order._id);
          console.log(`Coupon usage reset for returned order ${order._id}`);
        } catch (error) {
          console.error("Error resetting coupon usage for returned order:", error);
        }
      }
    }

    // Restock products
    for (let prod of updatedProducts) {
      const productDoc = await Product.findOne({ productName: prod.name });
      if (productDoc) {
        await Product.updateOne(
          { _id: productDoc._id, "variants.size": prod.size },
          { $inc: { "variants.$.variantQuantity": prod.quantity } }
        );
      }
    }

    // Wallet refund (COD + Online)
    const wallet = await Wallet.findOne({ userId: order.userId });
    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found for user" });
    }

    const newBalance = wallet.balance + refundAmount;
    const transaction = {
      transactionId: Date.now().toString() + Math.random().toString(36).slice(2, 7).toUpperCase(),
      type: "credit",
      amount: refundAmount,
      description: `Refund for returned items: ${updatedProducts.map(p => `${p.name} (${p.quantity} units, size ${p.size})`).join(", ")}`,
      balanceAfter: newBalance,
      orderId: order._id,
      status: "completed",
      source: "return_refund"
    };

    wallet.transactions.unshift(transaction);
    wallet.balance = newBalance;
    await wallet.save();
    await order.save();

    res.status(200).json({
      success: true,
      message: "Return request approved and refund processed (added to wallet)",
      updatedProducts,
      refundAmount: refundAmount.toFixed(2)
    });

  } catch (error) {
    console.error("Approve Return Error:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};



const rejectReturnRequest = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    
    // Fix: Use findOne with orderNumber instead of findById
    const order = await Order.findOne({ orderNumber: orderId });
    
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    let itemFound = false;
    order.items = order.items.map(item => {
      const itemProductId = item.productId._id?.toString?.() || item.productId?.toString?.();
      // Fix: Use === instead of = for comparison
      if (itemProductId === productId && item.status === 'ReturnRequested') {
        item.status = 'Delivered'; 
        item.returnReason = null;
        item.returnDate = null;
        itemFound = true;
      }
      return item;
    });
    
    if (!itemFound) {
      return res.status(400).json({ 
        success: false, 
        message: "Return request not found or already processed" 
      });
    }
    const hasReturnRequested = order.items.some(item => item.status === 'ReturnRequested');
    if (!hasReturnRequested) {
        order.orderStatus = 'Delivered'; 
    }
    await order.save();
    res.status(200).json({ success: true, message: "Return request rejected" });
    
  } catch (error) {
    console.error("Reject Return Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};


module.exports = {
  ordersPage,
  updateOrderStatus,
  orderDetails,
  viewReturnRequests,
  approveReturnRequest,
  rejectReturnRequest,
};