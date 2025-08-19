const mongoose = require("mongoose");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Order = require("../../models/orderSchema");
const Wallet = require("../../models/walletSchema")
require("dotenv").config();

const ordersPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find({})
      .populate("userId", "fullname email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render("admin/adminordersPage", {
      orders,
      currentPage: page,
      totalPages,
      totalOrders,
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
    const order = await Order.findById(orderId)
      .populate('items.productId')
      .populate('userId')

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.render('adminOrderDetailsPage', {
      order
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
    
    // Process only the specific product return request
    order.items = order.items.map(item => {
      if (item.productId._id.toString() === productId && item.status === "ReturnRequested") {
        item.status = "Returned";
        refundAmount += item.price || item.productId.price || 0;
        updatedProducts.push({
          name: item.productId.productName || "Unknown Product",
          quantity: item.quantity || 1,
          size: item.size
        });
        productFound = true;
      }
      return item;
    });
    
    if (!productFound) {
      return res.status(400).json({ 
        success: false, 
        message: "Product return request not found or already processed" 
      });
    }
    
    // Check if all items in the order are returned
    let allOrderReturn = true;
    order.items.forEach(item => {
      if (item.status !== "Returned" && item.status !== "Cancelled") {
        allOrderReturn = false;
      }
    });
    
    if (allOrderReturn) {
      order.orderStatus = "Returned";
    }
    
    // Update product quantities for the returned item
    for (let prod of updatedProducts) {
      const productDoc = await Product.findOne({ "productName": prod.name });
      if (productDoc) {
        const variant = productDoc.variants.find(v => v.size === prod.size);
        if (variant) {
          variant.variantQuantity += prod.quantity;
          await productDoc.save();
        }
      }
    }
    
    // Wallet refund
    const wallet = await Wallet.findOne({ userId: order.userId });
    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found for user" });
    }
    
    const newBalance = wallet.balance + refundAmount;
    const transaction = {
      transactionId: "TXN" + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase(),
      type: "credit",
      amount: refundAmount,
      description: `Refund for returned items: ${updatedProducts.map(p => `${p.name} (${p.quantity} units, size ${p.size})`).join(", ")}`,
      balanceAfter: newBalance,
      orderId: order._id,  
      status: "completed",
      source: "return_refund"
    };
    
    wallet.transactions.push(transaction);
    wallet.balance = newBalance;
    await wallet.save();
    await order.save();
    
    res.status(200).json({
      success: true,
      message: "Return request approved and refund processed",
      updatedProducts
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